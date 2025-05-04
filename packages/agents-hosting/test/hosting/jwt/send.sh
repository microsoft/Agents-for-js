echo $ACCESS_TOKEN
DATA='{
  "type": "message",
  "text": "Hello from test client",
  "from": {
    "id": "test-user-id",
    "name": "Test User"
  },
  "recipient": {
    "id": "bot-id",
    "name": "Test Bot"
  },
  "conversation": {
    "id": "conversation-id-123"
  },
  "channelId": "test",
  "serviceUrl": "https://test.com",
  "id": "activity-id-123456"
}'

RESPONSE=$(curl -s -X POST "http://localhost:3000/api/messages" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$DATA")

echo -e "\nResponse:"
if [ "$JQ_AVAILABLE" = true ] && echo "$RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "$RESPONSE" | jq
else
    echo "$RESPONSE"
fi