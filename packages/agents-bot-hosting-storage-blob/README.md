# @microsoft/agents-bot-hosting-storage-blob

## Overview

This package allows to configure Azure Blob Storage as the backend for Agents conversation State

## Usage

```ts
const blobStorage = new AzureBlobStorage(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)
```