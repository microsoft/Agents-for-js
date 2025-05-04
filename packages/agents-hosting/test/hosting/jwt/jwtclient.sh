#!/bin/bash

# Check if required tools are installed
if ! command -v curl &> /dev/null || ! command -v jq &> /dev/null; then
    echo "Error: This script requires curl and jq to be installed."
    echo "Install with: sudo apt-get install curl jq"
    exit 1
fi

# Parameters
TENANT_ID="${1:-$TENANT_ID}"
CLIENT_ID="${2:-$CLIENT_ID}"
CLIENT_SECRET="${3:-$CLIENT_SECRET}"
SCOPE="${4:-$SCOPE}"

# Validate required parameters
if [ -z "$TENANT_ID" ] || [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
    echo "Usage: $0 <tenant_id> <client_id> <client_secret> [scope]"
    echo "Or set environment variables TENANT_ID, CLIENT_ID, CLIENT_SECRET, and optionally SCOPE"
    exit 1
fi

# Default scope if not provided
if [ -z "$SCOPE" ]; then
    SCOPE="https://graph.microsoft.com/.default"
fi

# Token endpoint
TOKEN_ENDPOINT="https://login.microsoftonline.com/$TENANT_ID/oauth2/v2.0/token"

# Request body
REQUEST_BODY="client_id=$CLIENT_ID&scope=$SCOPE&client_secret=$CLIENT_SECRET&grant_type=client_credentials"

# Make the request
echo "Requesting token from Entra ID..."
RESPONSE=$(curl -s -X POST "$TOKEN_ENDPOINT" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "$REQUEST_BODY")

# Check for errors
if echo "$RESPONSE" | jq -e '.error' > /dev/null; then
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    ERROR_DESC=$(echo "$RESPONSE" | jq -r '.error_description')
    echo "Error: $ERROR"
    echo "Description: $ERROR_DESC"
    exit 1
fi

# Extract the token
ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')

if [ "$ACCESS_TOKEN" = "null" ]; then
    echo "Failed to extract access token from response"
    echo "$RESPONSE"
    exit 1
fi
export ACCESS_TOKEN="$ACCESS_TOKEN"
echo "Token obtained successfully!"
echo " "
echo "$ACCESS_TOKEN"
echo " "
echo "Token expires in $(echo "$RESPONSE" | jq -r '.expires_in') seconds"