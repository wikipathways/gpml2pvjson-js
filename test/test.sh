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
  echo "Testing converter against $f"
  filename=`echo "$f" | sed "s/.*\\///" | sed s/.xml$// | sed s/.gpml$//`
  "$bin_dir"/gpml2pvjson < "$f" > "$output_dir/$filename.json";
  cat "$f" | "$bin_dir"/gpml2pvjson | "$bin_dir"/sha1sumup -c "$SCRIPT_DIR/expected/$filename.json.sha1sum"
  # if previous command had a non-zero exit code, tell what to do
  if [ $? -ne 0 ]; then
    any_failed=1

    echo "" 1>&2

    echo "Compare expected vs. actual:" 1>&2
    echo "jq . \"$SCRIPT_DIR/expected/$filename.json\" > old.json" 1>&2
    echo "jq . \"$output_dir/$filename.json\" > new.json" 1>&2
    echo "vim -d old.json new.json" 1>&2

    echo "" 1>&2

    echo "Is it just a key sorting issue?" 1>&2
    echo "jq -S . \"$SCRIPT_DIR/expected/$filename.json\" > fold.json" 1>&2
    echo "jq -S . \"$output_dir/$filename.json\" > fnew.json" 1>&2
    echo "vim -d fold.json fnew.json" 1>&2

    echo "" 1>&2

    echo "If the changes look OK, update expected JSON files and hashes:" 1>&2
    echo "npm run expected" 1>&2

    echo "" 1>&2

    if [ "$bail" == "--bail" ]; then
      break
    fi
  fi
done

if [ "$any_failed" -eq 0 ]; then
  # if none of the conversions failed, then the output directory will
  # be identical to the expected directory.
  rm -rf "$output_dir"
else
  exit 1
fi
