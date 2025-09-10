for dir in ./packages/*; do
    echo "typedocfx for $dir"
    (cd "$dir" && npx type2docfx . "./../../docs/yaml/${PWD##*/}" && cd ../..)
done
