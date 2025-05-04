source ../../../../../../rido-dev-agent.env
export TENANT_ID=$tenantId
export CLIENT_ID=$clientId
export CLIENT_SECRET=$clientSecret
export SCOPE="https://api.botframework.com/.default"
./jwtclient.sh