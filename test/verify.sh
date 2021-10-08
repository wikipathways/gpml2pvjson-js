# see https://stackoverflow.com/a/246128/5354298
get_script_dir() { echo "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; }
SCRIPT_DIR=$(get_script_dir)

gpml_dir="$1"

if [ ! -d "$1" ]; then
  echo "Please specify a gpml_dir" 1>&2
  exit 1
fi

bail="$2"

output_dir="./actual"
mkdir -p "$output_dir"

bin_dir="$SCRIPT_DIR"/../bin

any_failed=0

for f in "$gpml_dir"/*.gpml{,.xml}; do
  echo "----------------------- Testing converter against $f"
  filename=`echo "$f" | sed "s/.*\\///" | sed s/.xml$// | sed s/.gpml$//`
  "$bin_dir"/gpml2pvjson < "$f" > "$output_dir/$filename.json";
  cat "$f" | "$bin_dir"/gpml2pvjson | jq -S 'del(.pathway.id) | del(.entitiesById[] | select(.points) | .points[] | .id)' >fnew.json

  if [ ! -e "$SCRIPT_DIR/expected/$filename.json" ]; then
    echo "Missing $SCRIPT_DIR/expected/$filename.json" 1>&2
    continue
  fi

  jq -S 'del(.pathway.id)' "$SCRIPT_DIR/expected/$filename.json" > fold.json

  if cmp -s fold.json fnew.json; then
    echo "identical" 1>&2
  else

    for gpmlElementName in "Anchor" "DataNode" "GraphicalLine" "Group" "Interaction" "Label" "Shape" "State"; do
      if ! cmp -s <(jq --arg gpmlElementName "$gpmlElementName" '.entitiesById | to_entries | map(select(.value.gpmlElementName=="$gpmlElementName")) | length' fold.json) \
          <(jq --arg gpmlElementName "$gpmlElementName" '.entitiesById | to_entries | map(select(.value.gpmlElementName=="$gpmlElementName")) | length' fnew.json); then
        echo "  Counts for $gpmlElementName don't match" 1>&2
      fi
    done

    echo "  jq -S . \"$SCRIPT_DIR/expected/$filename.json\" > fold.json" 1>&2
    echo "  jq -S . \"$output_dir/$filename.json\" > fnew.json" 1>&2
    echo "  vim -d fold.json fnew.json" 1>&2

    diff -C 3 fold.json fnew.json

    echo "" 1>&2
  fi
done
