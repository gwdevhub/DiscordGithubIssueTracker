# GitHub Issues Discord Bot

A Discord bot that tracks GitHub issues and displays them in organized embeds by label. Perfect for keeping your Discord community updated on project status without cluttering channels with notifications.

## Features

- 🏷️ **Organized by Labels** - Each label gets its own embed (bug, pending release, etc.)
- 🔄 **Auto-Updates** - Refreshes issue status every 5 minutes
- 🌐 **Multi-Server Support** - One bot instance can serve multiple Discord servers
- 🔗 **Direct GitHub Links** - Click to view issues directly on GitHub
- 📊 **Smart Filtering** - Only shows actual issues (ignores pull requests)
- 🎯 **Priority System** - Issues with multiple labels appear in highest-priority embed only
- ⚡ **Case-Insensitive** - Works regardless of label casing differences

## Screenshots

![Bot in action showing bug and pending release issues](https://via.placeholder.com/600x400?text=Discord+Issues+Bot+Screenshot)

## Quick Start

### Prerequisites

- Node.js 18+ 
- Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- GitHub repository to track
- Optional: GitHub personal access token for higher rate limits

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/github-issues-discord-bot.git
   cd github-issues-discord-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your tokens and repository info
   ```

4. **Run the bot**
   ```bash
   npm start
   ```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token

# Repository to track
REPO_OWNER=gwdevhub
REPO_NAME=GWToolboxpp

# Optional - improves rate limits
GITHUB_TOKEN=your_github_personal_access_token
```

### Bot Configuration

Edit the `config` object in `index.mjs`:

```javascript
const config = {
    // Discord channel name where issues will be posted
    ISSUES_CHANNEL: 'github-issues',
    
    // Labels to specifically track (empty = all labels except excluded)
    INCLUDED_LABELS: ['pending release', 'bug'],
    
    // Labels to exclude from tracking
    EXCLUDED_LABELS: ['invalid', 'spam', 'question'],
    
    // Priority labels (appear first in priority order)
    PRIORITY_LABELS: [],
    
    // Track issues with no labels
    TRACK_UNLABELED: true,
    
    // Update frequency in minutes
    UPDATE_INTERVAL: 5,
    
    // Maximum issues per label embed
    MAX_ISSUES_PER_LABEL: 10
};
```

## Discord Setup

1. **Create Discord Bot**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create new application → Bot
   - Enable "Message Content Intent" in Bot settings
   - Copy bot token

2. **Invite Bot to Server**
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=379968&scope=bot
   ```
   
3. **Create Issues Channel**
   - Create a channel named `#github-issues` (or change `ISSUES_CHANNEL` config)
   - Ensure bot has read/write permissions

## Commands

Use these commands in the `#github-issues` channel:

- `!refresh-issues` - Manually update issues
- `!refresh-labels` - Re-fetch labels from GitHub
- `!status` - Show bot status and configuration

## Deployment

### Railway (Recommended Free Option)

1. Push your code to GitHub
2. Sign up at [Railway](https://railway.app)
3. Create new project from GitHub repo
4. Add environment variables in Railway dashboard
5. Deploy automatically

### Other Platforms

- **Render**: Similar to Railway, 750 free hours/month
- **Heroku**: Paid plans starting at $5/month
- **DigitalOcean**: App Platform starting at $5/month
- **VPS**: Any Linux server with Node.js

## How It Works

1. **Fetches Issues**: Connects to GitHub API to get open issues
2. **Filters by Labels**: Only shows configured labels (case-insensitive)
3. **Priority Assignment**: Issues with multiple labels go to highest-priority embed
4. **Updates Discord**: Creates/updates embeds for each label
5. **Provides Links**: Each embed links to GitHub for full issue details

## Label Priority System

When an issue has multiple labels, it appears in only one embed based on priority:

```javascript
// Example: Issue has labels ['enhancement', 'bug', 'confirmed']
// Priority order: ['pending release', 'bug', 'enhancement', 'confirmed']
// Result: Issue appears in 'bug' embed only
```

## Multi-Server Support

The bot can serve multiple Discord servers simultaneously:

- Each server needs its own `#github-issues` channel
- All servers track the same GitHub repository
- Server data is isolated (separate embeds per server)
- Commands work independently per server

## Rate Limits

- **Without GitHub token**: 60 requests/hour
- **With GitHub token**: 5,000 requests/hour

For active repositories, a GitHub token is recommended.

## Troubleshooting

### Bot doesn't respond
- Check "Message Content Intent" is enabled
- Verify bot has permissions in the channel
- Ensure channel is named exactly `github-issues`

### Issues not updating
- Check console for API errors
- Verify GitHub repository exists and is accessible
- Check rate limit status with `!status` command

### Missing labels
- Use `!refresh-labels` to re-fetch from GitHub
- Check label names match exactly (case-insensitive)
- Verify labels exist on GitHub repository

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/yourusername/repo/issues)
- 💡 **Feature Requests**: [Open an issue](https://github.com/yourusername/repo/issues)
- 💬 **Discord Support**: Join our [Discord server](https://discord.gg/yourserver)

## Acknowledgments

- Built with [discord.js](https://discord.js.org/)
- GitHub integration via [@octokit/rest](https://github.com/octokit/rest.js)
- Inspired by the need for better issue tracking in Discord communities