import { Client, GatewayIntentBits, EmbedBuilder, ChannelType } from 'discord.js';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import express from 'express';

// Load environment variables
dotenv.config();

// Configuration
const config = {
    // Discord Bot Token (get from Discord Developer Portal)
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,

    // GitHub Personal Access Token (optional for public repos)
    // Without token: 60 requests/hour | With token: 5000 requests/hour
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,

    // Your repository (owner/repo format)
    REPO_OWNER: process.env.REPO_OWNER || 'gwdevhub',
    REPO_NAME: process.env.REPO_NAME || 'GWToolboxpp',

    // Discord channel name where issues will be posted
    ISSUES_CHANNEL: 'github-issues',

    // Labels to exclude from tracking (optional)
    EXCLUDED_LABELS: [],

    // Labels to specifically include (if empty, includes all except excluded)
    // ORDER MATTERS: Issues with multiple labels will be placed in the first matching label's embed
    INCLUDED_LABELS: ['pending release', 'bug', 'feature request', 'enhancement'],

    // Track unlabeled issues
    TRACK_UNLABELED: true,

    // How often to check for updates (in minutes)
    UPDATE_INTERVAL: 5,

    // Maximum issues to show per label
    MAX_ISSUES_PER_LABEL: 100
};

console.log('Bot configuration:', {
    repo: `${config.REPO_OWNER}/${config.REPO_NAME}`,
    hasToken: !!config.GITHUB_TOKEN,
    updateInterval: config.UPDATE_INTERVAL
});

const app = express()
const port = process.env.PORT || 10000

app.get('/', (req, res) => {
    res.send('');
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

class MultiServerGitHubIssuesBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        // Create Octokit instance (with or without auth)
        const oktokitConfig = {};
        if (config.GITHUB_TOKEN) {
            oktokitConfig.auth = config.GITHUB_TOKEN;
            console.log('🔑 Using GitHub token (5000 requests/hour)');
        } else {
            console.log('⚠️  No GitHub token - using anonymous access (60 requests/hour)');
        }
        this.octokit = new Octokit(oktokitConfig);

        // Multi-server data storage: guildId -> { issuesChannel, messageIds, availableLabels }
        this.servers = new Map();
        this.lastUpdate = new Date();
    }

    async start() {
        this.client.once('ready', () => {
            console.log(`✅ Bot logged in as ${this.client.user.tag}`);
            console.log(`🌐 Connected to ${this.client.guilds.cache.size} server(s)`);
            this.initializeAllServers();
        });

        // Handle joining new servers
        this.client.on('guildCreate', (guild) => {
            console.log(`➕ Joined new server: ${guild.name} (${guild.id})`);
            this.initializeServer(guild);
        });

        // Handle leaving servers
        this.client.on('guildDelete', (guild) => {
            console.log(`➖ Left server: ${guild.name} (${guild.id})`);
            this.servers.delete(guild.id);
        });

        // Handle commands
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            if (!message.guild) return; // Ignore DMs

            const serverData = this.servers.get(message.guild.id);
            if (!serverData?.issuesChannel) return;

            // Only respond in the issues channel
            if (message.channel.name !== config.ISSUES_CHANNEL) return;

            try {
                if (message.content === '!refresh-issues') {
                    await this.updateIssuesForServer(message.guild.id);
                    await message.react('✅');
                }

                if (message.content === '!refresh-labels') {
                    await this.fetchLabelsForServer(message.guild.id);
                    await this.scanExistingMessages(message.guild.id);
                    await this.updateIssuesForServer(message.guild.id);
                    await message.react('🏷️');
                }

                if (message.content === '!status') {
                    const embed = new EmbedBuilder()
                        .setTitle('📊 Bot Status')
                        .setColor(0x00ff00)
                        .addFields(
                            { name: 'Repository', value: `${config.REPO_OWNER}/${config.REPO_NAME}`, inline: true },
                            { name: 'Labels Tracked', value: serverData.availableLabels.size.toString(), inline: true },
                            { name: 'Last Update', value: this.lastUpdate.toLocaleString(), inline: true }
                        )
                        .setTimestamp();

                    await message.reply({ embeds: [embed] });
                }
            } catch (error) {
                console.error(`❌ Error handling command in ${message.guild.name}:`, error);
                await message.react('❌');
            }
        });

        await this.client.login(config.DISCORD_TOKEN);
    }

    async initializeAllServers() {
        console.log('🔧 Initializing all servers...');

        for (const guild of this.client.guilds.cache.values()) {
            await this.initializeServer(guild);
        }

        // Start periodic updates for all servers
        console.log(`⏰ Starting periodic updates every ${config.UPDATE_INTERVAL} minutes`);
        setInterval(async () => {
            await this.updateAllServers();
        }, config.UPDATE_INTERVAL * 60 * 1000);
    }

    async initializeServer(guild) {
        try {
            console.log(`🔧 Setting up server: ${guild.name} (${guild.id})`);

            // Find the issues channel
            const issuesChannel = guild.channels.cache.find(
                channel => channel.name === config.ISSUES_CHANNEL &&
                    channel.type === ChannelType.GuildText
            );

            if (!issuesChannel) {
                console.log(`❌ No #${config.ISSUES_CHANNEL} channel found in ${guild.name}`);
                return;
            }

            console.log(`📋 Found issues channel in ${guild.name}: #${issuesChannel.name}`);

            // Initialize server data
            const serverData = {
                issuesChannel: issuesChannel,
                messageIds: new Map(), // label -> messageId
                availableLabels: new Set(),
                labelPriority: [] // Ordered list for priority determination
            };

            this.servers.set(guild.id, serverData);

            // Fetch labels and do initial update
            await this.fetchLabelsForServer(guild.id);
            await this.scanExistingMessages(guild.id);
            await this.updateIssuesForServer(guild.id);

            console.log(`✅ Successfully initialized ${guild.name}`);

        } catch (error) {
            console.error(`❌ Failed to initialize ${guild.name}:`, error);
        }
    }

    async scanExistingMessages(guildId) {
        const serverData = this.servers.get(guildId);
        if (!serverData) return;

        const guild = this.client.guilds.cache.get(guildId);

        try {
            console.log(`🔍 Scanning existing messages in ${guild.name}...`);

            // Fetch recent messages from the channel (up to 100)
            const messages = await serverData.issuesChannel.messages.fetch({ limit: 100 });

            // Look for messages from this bot with embeds
            const botMessages = messages.filter(msg =>
                msg.author.id === this.client.user.id &&
                msg.embeds.length > 0
            );

            // Map embed titles to message IDs
            for (const message of botMessages.values()) {
                const embed = message.embeds[0];
                if (embed?.title) {
                    // Extract label from title like "🏷️ BUG Issues" -> "bug"
                    const titleMatch = embed.title.match(/🏷️\s+(.+?)\s+Issues/i);
                    if (titleMatch) {
                        const labelFromTitle = titleMatch[1].toLowerCase();

                        // Find matching label in our available labels (case-insensitive)
                        const matchingLabel = Array.from(serverData.availableLabels).find(
                            label => label.toLowerCase() === labelFromTitle
                        );

                        if (matchingLabel) {
                            serverData.messageIds.set(matchingLabel, message.id);
                            console.log(`📌 Found existing message for '${matchingLabel}': ${message.id}`);
                        }
                    }
                }
            }

            console.log(`🔍 Found ${serverData.messageIds.size} existing label messages in ${guild.name}`);

        } catch (error) {
            console.error(`❌ Error scanning existing messages for ${guild.name}:`, error);
        }
    }

    async fetchLabelsForServer(guildId) {
        const serverData = this.servers.get(guildId);
        if (!serverData) return;

        const guild = this.client.guilds.cache.get(guildId);

        try {
            console.log(`🏷️ Fetching labels for ${guild.name}...`);

            const { data: labels } = await this.octokit.rest.issues.listLabelsForRepo({
                owner: config.REPO_OWNER,
                repo: config.REPO_NAME,
                per_page: 100
            });

            // Filter labels based on INCLUDED_LABELS and EXCLUDED_LABELS (case-insensitive)
            let filteredLabels;

            if (config.INCLUDED_LABELS.length > 0) {
                // If INCLUDED_LABELS is specified, use that order (case-insensitive)
                const includedLower = config.INCLUDED_LABELS.map(label => label.toLowerCase());
                filteredLabels = [];

                // First, add labels in the order specified in INCLUDED_LABELS
                for (const includedLabel of config.INCLUDED_LABELS) {
                    const matchingLabel = labels.find(label =>
                        label.name.toLowerCase() === includedLabel.toLowerCase()
                    );
                    if (matchingLabel) {
                        filteredLabels.push(matchingLabel.name);
                    }
                }

                console.log(`📋 Using INCLUDED_LABELS order for ${guild.name}`);
            } else {
                // If INCLUDED_LABELS is empty, use GitHub's fetch order minus excluded labels
                const excludedLower = config.EXCLUDED_LABELS.map(label => label.toLowerCase());
                filteredLabels = labels
                    .map(label => label.name)
                    .filter(name => !excludedLower.includes(name.toLowerCase()));
                console.log(`📋 Using GitHub fetch order for ${guild.name}`);
            }

            serverData.availableLabels = new Set(filteredLabels);
            serverData.labelPriority = filteredLabels; // Store the order

            // Add unlabeled tracking if enabled
            if (config.TRACK_UNLABELED) {
                serverData.availableLabels.add('unlabeled');
                serverData.labelPriority.push('unlabeled'); // Unlabeled goes last
            }

            console.log(`📝 Found ${serverData.availableLabels.size} labels for ${guild.name}:`,
                Array.from(serverData.availableLabels).sort().join(', '));

        } catch (error) {
            console.error(`❌ Error fetching labels for ${guild.name}:`, error);
            // Fallback to included labels or empty set
            if (config.INCLUDED_LABELS.length > 0) {
                serverData.availableLabels = new Set(config.INCLUDED_LABELS);
                serverData.labelPriority = [...config.INCLUDED_LABELS];
            } else {
                serverData.availableLabels = new Set();
                serverData.labelPriority = [];
            }
            if (config.TRACK_UNLABELED) {
                serverData.availableLabels.add('unlabeled');
                serverData.labelPriority.push('unlabeled');
            }
        }
    }

    async updateAllServers() {
        console.log('🔄 Running periodic update for all servers...');

        for (const guildId of this.servers.keys()) {
            await this.updateIssuesForServer(guildId);
        }

        this.lastUpdate = new Date();
        console.log(`✅ Completed update cycle at ${this.lastUpdate.toLocaleTimeString()}`);
    }

    async updateIssuesForServer(guildId) {
        const serverData = this.servers.get(guildId);
        if (!serverData) return;

        const guild = this.client.guilds.cache.get(guildId);

        try {
            console.log(`🔄 Updating issues for ${guild.name}...`);

            // Fetch all open issues from GitHub (excluding pull requests)
            const { data: issues } = await this.octokit.rest.issues.listForRepo({
                owner: config.REPO_OWNER,
                repo: config.REPO_NAME,
                state: 'open',
                per_page: 100,
                sort: 'updated',
                direction: 'desc'
            });

            // Filter out pull requests (GitHub API returns PRs as issues)
            const actualIssues = issues.filter(issue => !issue.pull_request);

            // Group issues by label
            const issuesByLabel = new Map();

            // Initialize with all tracked labels
            for (const label of serverData.availableLabels) {
                issuesByLabel.set(label, []);
            }

            // Categorize issues using priority-based assignment (case-insensitive)
            actualIssues.forEach(issue => {
                // Check if issue has any labels
                if (issue.labels.length === 0 && serverData.availableLabels.has('unlabeled')) {
                    // Add to unlabeled category
                    const unlabeledIssues = issuesByLabel.get('unlabeled');
                    if (unlabeledIssues.length < config.MAX_ISSUES_PER_LABEL) {
                        unlabeledIssues.push(issue);
                    }
                } else {
                    // Find the first label in priority order that this issue has (case-insensitive)
                    const issueLabels = issue.labels.map(label => label.name);
                    const firstLabelMatch = serverData.labelPriority.find(priorityLabel =>
                        issueLabels.some(issueLabel => issueLabel.toLowerCase() === priorityLabel.toLowerCase())
                    );

                    if (firstLabelMatch) {
                        const labelIssues = issuesByLabel.get(firstLabelMatch);
                        if (labelIssues && labelIssues.length < config.MAX_ISSUES_PER_LABEL) {
                            labelIssues.push(issue);
                        }
                    }
                }
            });

            // Update embeds for each label
            for (const [label, labelIssues] of issuesByLabel) {
                // Only create/update embeds if there are issues OR we already have a message for this label
                await this.updateLabelEmbed(guildId, label, labelIssues);
            }

            console.log(`✅ Updated ${actualIssues.length} issues for ${guild.name} (${issues.length - actualIssues.length} PRs ignored)`);

        } catch (error) {
            console.error(`❌ Error updating issues for ${guild.name}:`, error);
        }
    }

    async updateLabelEmbed(guildId, label, issues) {
        const serverData = this.servers.get(guildId);
        if (!serverData) return;

        try {
            const embed = new EmbedBuilder()
                .setTitle(`🏷️ ${label.toUpperCase()} Issues`)
                .setColor(this.getLabelColor(label))
                .setTimestamp()
                .setFooter({
                    text: `Last updated • ${issues.length} issue${issues.length !== 1 ? 's' : ''}`
                });

            // Add GitHub link for this label
            const githubUrl = this.getGitHubLabelUrl(label);
            embed.setURL(githubUrl);

            if (issues.length === 0) {
                embed.setDescription(`✅ No open issues with this label\n\n🔗 [View all ${label} issues on GitHub](${githubUrl})`);
            } else {
                const description = issues.map(issue => {
                    return `**[#${issue.number}](${issue.html_url})** ${issue.title}`;
                }).join('\n');

                const fullDescription = `${description}\n\n🔗 [View all ${label} issues on GitHub](${githubUrl})`;

                // Truncate if too long
                embed.setDescription(fullDescription.length > 4096 ?
                    description.substring(0, 4000) + `...\n\n🔗 [View all ${label} issues on GitHub](${githubUrl})` : fullDescription);
            }

            // Check if we have an existing message for this label
            const existingMessageId = serverData.messageIds.get(label);

            if (existingMessageId) {
                try {
                    // Try to update existing message
                    const existingMessage = await serverData.issuesChannel.messages.fetch(existingMessageId);
                    await existingMessage.edit({ embeds: [embed] });
                } catch (error) {
                    // Message was deleted, create a new one
                    const newMessage = await serverData.issuesChannel.send({ embeds: [embed] });
                    serverData.messageIds.set(label, newMessage.id);
                }
            } else {
                // Create new message
                const newMessage = await serverData.issuesChannel.send({ embeds: [embed] });
                serverData.messageIds.set(label, newMessage.id);
            }

        } catch (error) {
            console.error(`❌ Error updating embed for label '${label}' in guild ${guildId}:`, error);
        }
    }

    getHighestPriorityLabel(serverData, issueLabels) {
        // Find the first label in priority order that this issue has
        for (const priorityLabel of serverData.labelPriority) {
            if (issueLabels.includes(priorityLabel)) {
                return priorityLabel;
            }
        }
        return null; // No matching labels found
    }

    getGitHubLabelUrl(label) {
        const baseUrl = `https://github.com/${config.REPO_OWNER}/${config.REPO_NAME}/issues`;

        if (label === 'unlabeled') {
            // Special URL for unlabeled issues
            return `${baseUrl}?q=is%3Aopen+is%3Aissue+no%3Alabel`;
        } else {
            // URL for specific label
            const encodedLabel = encodeURIComponent(label);
            return `${baseUrl}?q=is%3Aopen+is%3Aissue+label%3A"${encodedLabel}"`;
        }
    }

    getLabelColor(label) {
        // Convert to lowercase for color matching (case-insensitive)
        const lowerLabel = label.toLowerCase();
        const colors = {
            'bug': 0xff0000,                // Red
            'pending release': 0x00ff00,    // Green
            'unlabeled': 0x666666,          // Gray
            'confirmed': 0xff6600,          // Orange
            'investigating': 0xffff00,      // Yellow
            'in-progress': 0x0099ff,        // Blue
            'needs-info': 0x9900ff,         // Purple
            'help-wanted': 0x00ff00,        // Green
            'wontfix': 0x666666,            // Gray
            'duplicate': 0x333333,          // Dark Gray
            'enhancement': 0x84b6eb,        // Light Blue
            'priority-high': 0xff3333,      // Bright Red
            'priority-low': 0x99ccff        // Very Light Blue
        };
        return colors[lowerLabel] || 0x7289da; // Discord default blue
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }
}

// Start the bot
const bot = new MultiServerGitHubIssuesBot();
bot.start().catch(console.error);

export default MultiServerGitHubIssuesBot;