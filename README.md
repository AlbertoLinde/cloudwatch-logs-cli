# CloudWatch Logs CLI 📊

![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen)
![AWS](https://img.shields.io/badge/AWS-CloudWatch-orange)
![CLI](https://img.shields.io/badge/CLI-Tool-blue)

Tired of logging into CloudWatch via the web or using AWS commands to view logs? 😓 Want a simpler, faster way to do it?

Introducing **CloudWatch Logs CLI**! 🚀 This CLI tool lets you read and stream CloudWatch logs directly from your terminal. Just select the log group and stream logs in real-time. Perfect for quick monitoring and debugging, all from your terminal.

## Features ✨

- **AWS Configuration Check**: Ensures your AWS credentials are set and valid before proceeding.
- **Region Selection**: Choose your AWS region for fetching logs.
- **Log Group Navigation**: Easily navigate through your log groups, including sub-groups.
- **Date Filtering**: Filter log groups by creation date (all, this year, this month, today).
- **Real-Time Streaming**: Stream logs in real-time, updating every 2 seconds.
- **Back Navigation**: Seamlessly navigate back to previous menus.
- **Credentials Handling**: Handles expired or invalid tokens, prompting for new credentials when needed.
- **User-Friendly Interface**: Simple and intuitive prompts to guide you through the process.

## Installation 📦

Make sure you have [Node.js](https://nodejs.org/) (version 18 or higher) installed.

```bash
npm install -g cloudwatch-logs-cli
```

## Usage 🚀

### Start the CLI:

```bash
cwlogs logs
```

### Follow the prompts to:

- Ensure your AWS credentials are configured.
- Select your AWS region.
- Navigate through log groups.
- Stream logs in real-time.

### Stop Streaming:

Press `q` to stop streaming logs and navigate back.

## Prerequisites 🛠

- AWS credentials (Access Key ID, Secret Access Key, and optionally Session Token)
- AWS IAM permissions to access CloudWatch logs

## Example Commands 🌟

```bash
# Start the CLI tool
cwlogs logs
```

## Important Notes 📌

Ensure your AWS credentials are configured. You can provide these when prompted or set them as environment variables:

```bash
export AWS_ACCESS_KEY_ID="your-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
export AWS_SESSION_TOKEN="your-session-token"  # if applicable
```

## Dependencies 📚

- [Node.js 18+](https://nodejs.org/)
- [AWS SDK for JavaScript (v3)](https://github.com/aws/aws-sdk-js-v3)
- [Inquirer](https://github.com/SBoudrias/Inquirer.js)
- [Chalk](https://github.com/chalk/chalk)
- [Ora](https://github.com/sindresorhus/ora)

## License 📄

This project is licensed under the MIT License.

## Author 👨‍💻

Developed with ❤️ by [Alberto Linde](https://www.albertolinde.com)  
For any queries, you can reach me at [abreulindealberto@gmail.com](mailto:abreulindealberto@gmail.com)

---

Remember: Monitoring your logs is crucial for maintaining robust and reliable systems. Keep coding and keep improving! 🖥️💪
