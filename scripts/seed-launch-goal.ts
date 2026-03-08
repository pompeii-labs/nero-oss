import { Goal, Milestone, Task } from '../src/models/index.js';
import { createGoal } from '../src/goals/manager.js';
import { initDb, closeDb, migrateDb } from '../src/db/index.js';

async function seedLaunchGoal() {
    // Initialize database and run migrations first
    await initDb();
    await migrateDb();

    console.log('Creating Nero OSS Launch goal...\n');

    const plan = {
        title: 'Nero OSS Public Launch',
        description:
            'Prepare and execute the public launch of Nero as an open-source AI assistant platform. Target: end of March 2026.',
        priority: 5, // P1
        deadline: new Date('2026-03-31'),
        tags: ['launch', 'marketing', 'oss', 'product'],
        milestones: [
            {
                title: 'Documentation & README',
                description: 'Complete all user-facing documentation',
                orderIndex: 0,
                tasks: [
                    {
                        title: 'Write comprehensive README',
                        description: 'Features, installation, quick start, architecture overview',
                        priority: 'high' as const,
                        autonomyEligible: true,
                    },
                    {
                        title: 'Create feature highlights page',
                        description: 'Document the 5 game changer features with examples',
                        priority: 'high' as const,
                        autonomyEligible: true,
                    },
                    {
                        title: 'Write architecture docs',
                        description: 'System design, data flow, extension points',
                        priority: 'medium' as const,
                        autonomyEligible: true,
                    },
                    {
                        title: 'Create installation guide',
                        description: 'Docker, local dev, configuration options',
                        priority: 'high' as const,
                        autonomyEligible: true,
                    },
                ],
            },
            {
                title: 'Repository Cleanup',
                description: 'Prepare repo for public eyes',
                orderIndex: 1,
                dependencies: [0],
                tasks: [
                    {
                        title: 'Audit for secrets/credentials',
                        description: 'Check history for API keys, tokens, sensitive data',
                        priority: 'urgent' as const,
                        autonomyEligible: false, // Needs human review
                    },
                    {
                        title: 'Add CONTRIBUTING.md',
                        description: 'PR process, code style, issue templates',
                        priority: 'medium' as const,
                        autonomyEligible: true,
                    },
                    {
                        title: 'Create LICENSE',
                        description: 'Choose and add appropriate OSS license',
                        priority: 'high' as const,
                        autonomyEligible: false, // Matty's decision
                    },
                    {
                        title: 'Clean up code comments',
                        description: 'Remove TODOs, internal notes, profanity',
                        priority: 'low' as const,
                        autonomyEligible: true,
                    },
                ],
            },
            {
                title: 'Demo & Examples',
                description: 'Create compelling launch demos',
                orderIndex: 2,
                dependencies: [0],
                tasks: [
                    {
                        title: 'Record CLI demo video',
                        description: '2-3 minute showcase of core features',
                        priority: 'high' as const,
                        autonomyEligible: false, // Needs screen recording
                    },
                    {
                        title: 'Create example skills',
                        description: '3-5 example skills users can install',
                        priority: 'medium' as const,
                        autonomyEligible: true,
                    },
                    {
                        title: 'Write blog post announcement',
                        description: 'The story, the features, the vision',
                        priority: 'high' as const,
                        autonomyEligible: true,
                    },
                ],
            },
            {
                title: 'Launch Execution',
                description: 'Go live and announce',
                orderIndex: 3,
                dependencies: [1, 2],
                tasks: [
                    {
                        title: 'Make repo public',
                        description: 'Flip the switch on GitHub',
                        priority: 'urgent' as const,
                        autonomyEligible: false, // Matty only
                    },
                    {
                        title: 'Post to HN, Reddit, Twitter',
                        description: 'Launch announcements on key platforms',
                        priority: 'high' as const,
                        autonomyEligible: false, // Matty's accounts
                    },
                    {
                        title: 'Send to newsletter',
                        description: 'Email list announcement',
                        priority: 'medium' as const,
                        autonomyEligible: false, // Marketing
                    },
                    {
                        title: 'Monitor and respond',
                        description: 'First 48 hours of issue/PR monitoring',
                        priority: 'high' as const,
                        autonomyEligible: true,
                    },
                ],
            },
        ],
    };

    try {
        const goal = await createGoal(plan);
        if (goal) {
            console.log(`✅ Created goal #${goal.id}: ${goal.title}`);
            console.log(`   Status: ${goal.status}`);
            console.log(`   Deadline: ${goal.deadline?.toDateString()}`);
            console.log(`   Milestones: ${plan.milestones.length}`);
            console.log(
                `   Total tasks: ${plan.milestones.reduce((sum, m) => sum + m.tasks.length, 0)}`,
            );
        } else {
            console.error('❌ Failed to create goal');
            await closeDb();
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        await closeDb();
        process.exit(1);
    }

    await closeDb();
}

seedLaunchGoal();
