rm -rf node_modules/
rm package-lock.json
npm install

cp package-lock.json package-lock.json.bak
jq 'walk(if type == "object" and .link != true then del(.resolved, .integrity) else . end)' package-lock.json.bak > package-lock.json
rm package-lock.json.bak