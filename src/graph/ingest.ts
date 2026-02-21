import OpenAI from 'openai';
import chalk from 'chalk';
import { GraphNode } from '../models/graph-node.js';
import { GraphEdge } from '../models/graph-edge.js';
import { embed } from './embedding.js';
import { OPENROUTER_BASE_URL } from '../config.js';

const EXTRACTION_MODEL = 'anthropic/claude-haiku-4.5';

let extractionClient: OpenAI | null = null;

function getExtractionClient(): OpenAI {
    if (!extractionClient) {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error('OPENROUTER_API_KEY required for extraction');

        extractionClient = new OpenAI({
            baseURL: OPENROUTER_BASE_URL,
            apiKey,
        });
    }
    return extractionClient;
}

interface ExtractedEntity {
    type: string;
    label: string;
    body: string;
    category?: string;
}

interface ExtractedRelation {
    source: string;
    target: string;
    relation: string;
}

interface ExtractionResult {
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
}

const EXTRACTION_PROMPT = `Extract entities and relationships from this conversation. Return JSON only.

Entity types: memory, person, project, concept, event, preference
Relation types: related_to, mentioned_with, belongs_to, caused_by, contradicts, depends_on

Rules:
- Only extract CONCRETE, SPECIFIC entities worth remembering long-term
- Do NOT extract tools or services as entities (those are tracked automatically)
- "person" must be a real named individual, never vague references like "other AI" or "the user"
- "project" must be a real named project or product, never generic descriptions
- "concept" should only be used for genuinely important technical or domain concepts, not meta-observations about the conversation itself
- "label" should be a proper noun or short specific identifier (1-4 words)
- "body" should be the factual detail worth remembering
- For relations, use the label of the entity as source/target
- If there's nothing worth extracting, return empty arrays
- Do NOT extract trivial conversational filler, meta-commentary, or vague entities
- Prefer FEWER high-quality extractions over many low-quality ones

Return format:
{
  "entities": [{"type": "person", "label": "Sarah", "body": "Frontend engineer, works on the dashboard"}],
  "relations": [{"source": "Sarah", "target": "Dashboard", "relation": "belongs_to"}]
}`;

export async function extractEntities(
    messages: Array<{ role: string; content: string }>,
): Promise<ExtractionResult> {
    const client = getExtractionClient();
    const conversation = messages
        .slice(-6)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

    try {
        const response = await client.chat.completions.create({
            model: EXTRACTION_MODEL,
            messages: [
                { role: 'system', content: EXTRACTION_PROMPT },
                { role: 'user', content: conversation },
            ],
            temperature: 0.1,
            max_tokens: 1000,
        });

        const text = response.choices[0]?.message?.content?.trim() || '{}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { entities: [], relations: [] };

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            entities: Array.isArray(parsed.entities) ? parsed.entities : [],
            relations: Array.isArray(parsed.relations) ? parsed.relations : [],
        };
    } catch (error) {
        console.error(chalk.dim(`[graph] Extraction failed: ${(error as Error).message}`));
        return { entities: [], relations: [] };
    }
}

const SIMILARITY_THRESHOLD = 0.92;

export async function ingestConversation(
    messages: Array<{ role: string; content: string }>,
): Promise<{ nodesCreated: number; edgesCreated: number }> {
    const extraction = await extractEntities(messages);
    if (extraction.entities.length === 0) return { nodesCreated: 0, edgesCreated: 0 };

    let nodesCreated = 0;
    let edgesCreated = 0;

    const labelToNode = new Map<string, GraphNode>();

    for (const entity of extraction.entities) {
        try {
            const labelMatch = await GraphNode.findByLabel(entity.label, entity.type);
            if (labelMatch) {
                const mergedBody = labelMatch.body
                    ? `${labelMatch.body}\n${entity.body}`
                    : entity.body;
                await labelMatch.update({ body: mergedBody });
                await GraphNode.touch(labelMatch.id);
                labelToNode.set(entity.label.toLowerCase(), labelMatch);
                continue;
            }

            const textToEmbed = `${entity.label}: ${entity.body}`;
            const embedding = await embed(textToEmbed);

            const similar = await GraphNode.findSimilarWithScore(embedding, 1);

            if (similar.length > 0 && similar[0].similarity > SIMILARITY_THRESHOLD) {
                const existing = similar[0].node;
                const mergedBody = existing.body ? `${existing.body}\n${entity.body}` : entity.body;
                await existing.update({ body: mergedBody });
                await GraphNode.touch(existing.id);
                labelToNode.set(entity.label.toLowerCase(), existing);
                continue;
            }

            const node = await GraphNode.createWithEmbedding({
                type: entity.type,
                label: entity.label,
                body: entity.body,
                embedding,
                strength: 1.0,
                category: entity.category || null,
                metadata: {},
                memory_id: null,
            });

            labelToNode.set(entity.label.toLowerCase(), node);
            nodesCreated++;
        } catch (error) {
            console.error(
                chalk.dim(
                    `[graph] Failed to create node "${entity.label}": ${(error as Error).message}`,
                ),
            );
        }
    }

    for (const rel of extraction.relations) {
        try {
            let sourceNode = labelToNode.get(rel.source.toLowerCase());
            let targetNode = labelToNode.get(rel.target.toLowerCase());

            if (!sourceNode) {
                const sourceEmbedding = await embed(rel.source);
                const matches = await GraphNode.findSimilarWithScore(sourceEmbedding, 1);
                if (matches.length > 0 && matches[0].similarity > 0.8) {
                    sourceNode = matches[0].node;
                }
            }

            if (!targetNode) {
                const targetEmbedding = await embed(rel.target);
                const matches = await GraphNode.findSimilarWithScore(targetEmbedding, 1);
                if (matches.length > 0 && matches[0].similarity > 0.8) {
                    targetNode = matches[0].node;
                }
            }

            if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
                await GraphEdge.upsert(sourceNode.id, targetNode.id, rel.relation);
                edgesCreated++;
            }
        } catch (error) {
            console.error(chalk.dim(`[graph] Failed to create edge: ${(error as Error).message}`));
        }
    }

    if (nodesCreated > 0 || edgesCreated > 0) {
        console.log(chalk.dim(`[graph] Ingested: ${nodesCreated} nodes, ${edgesCreated} edges`));
    }

    return { nodesCreated, edgesCreated };
}
