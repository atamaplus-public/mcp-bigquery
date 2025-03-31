# BigQuery MCP Server

*Read this in other languages: [日本語](README.ja.md)*

An MCP (Model Context Protocol) server for querying BigQuery data. This allows AI assistants like Claude to directly access your BigQuery data.

## Features

- Execute SQL queries to BigQuery using natural language
- List datasets and tables
- View table schemas
- Execute read-only queries with security controls

## Usage

### Prerequisites

- Google Cloud project with BigQuery enabled
- Locally configured authentication credentials

```bash
gcloud auth application-default login
```

### Local Execution

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

3. Start the server:

```bash
npm start -- --project-id YOUR_PROJECT_ID --location YOUR_LOCATION
```

## Installation in Claude Desktop

Add the following entry to your Claude Desktop configuration file (typically `~/.config/Claude Desktop/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bigquery": {
      "command": "node",
      "args": [
        "/absolute/path/to/dist/index.js",
        "--project-id",
        "YOUR_PROJECT_ID",
        "--location",
        "us"  // For US multi-region datasets
      ],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/your/credentials.json"
      }
    }
  }
}
```

## Connectivity Test

To verify that the server is working correctly, run:

```bash
npm test
```

This test uses a configuration file for test settings. Follow these steps:

1. Copy the sample configuration file:
   ```bash
   cp config.sample.json config.json
   ```

2. Edit `config.json` to match your project settings:
   ```json
   {
     "projectId": "YOUR_PROJECT_ID",
     "location": "us",
     "testQuery": "SELECT 1",
     "resourceUri": "bigquery://YOUR_PROJECT_ID/YOUR_DATASET/YOUR_TABLE/schema"
   }
   ```

3. Run the test:
   ```bash
   npm test
   ```

The test will run the following checks:

- Retrieving resource list
- Retrieving tool list
- Executing SQL query
- Reading resource schema

## Configuration

The server accepts the following command line arguments:

- `--project-id`: (Required) Google Cloud project ID
- `--location`: (Optional) BigQuery location, defaults to 'us-central1'
  - Use 'us' for US multi-region datasets

## Limitations

- Only read-only queries are allowed
- Default query limit is 1GB of processed data
