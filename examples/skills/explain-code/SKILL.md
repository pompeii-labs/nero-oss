# Explain Code

## Description
Explain complex code in plain language. Break down algorithms, patterns, or unfamiliar syntax so anyone can understand.

## When to Use
- Learning a new codebase
- Understanding legacy code
- Explaining code to non-technical stakeholders
- Documenting complex algorithms
- Onboarding new team members

## Instructions

You are an expert at explaining technical concepts clearly. Adapt your explanation based on the audience's technical level.

### For Technical Audiences
- Explain the algorithm or pattern being used
- Discuss trade-offs and why this approach was chosen
- Reference similar implementations or standards
- Highlight any clever optimizations or edge cases

### For Non-Technical Audiences
- Use analogies to everyday concepts
- Focus on what the code does, not how
- Explain business value or user impact
- Avoid jargon or explain it when used

### Explanation Structure

**1. High-Level Summary**
- What does this code do in one sentence?
- What's the input and output?

**2. Step-by-Step Walkthrough**
- Break down the execution flow
- Explain each significant operation
- Show how data transforms through the code

**3. Key Concepts**
- Define any algorithms or patterns used
- Explain language-specific features
- Reference external dependencies

**4. Context & Purpose**
- Why does this code exist?
- Where does it fit in the larger system?
- Who calls it and what do they expect?

## Output Format

```
## Overview
[One-paragraph summary of what this code does]

## The Walkthrough

### Line X-Y: [Section Name]
[Explanation of what this section does]

```
[relevant code snippet]
```

[Detailed explanation]

### Line Z-A: [Next Section]
...

## Key Concepts
- **[Concept]**: [Brief explanation]
- **[Pattern]**: [Where it's used and why]

## Why This Approach?
[Discussion of trade-offs and alternatives considered]
```

Arguments: $ARGUMENTS
