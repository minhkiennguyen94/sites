#!/bin/zsh
cd /Users/mac/.gemini/antigravity/scratch/inventory_app

output="Index.html"
echo -n "" > $output

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ '<link rel="stylesheet" href="styles.css">' ]]; then
    echo "<style>" >> $output
    cat styles.css >> $output
    echo "</style>" >> $output
  elif [[ "$line" =~ '<script src="database.js"></script>' ]]; then
    echo "<script>" >> $output
    cat database.js >> $output
    echo "</script>" >> $output
  elif [[ "$line" =~ '<script src="app.js"></script>' ]]; then
    echo "<script>" >> $output
    echo "  // Auto-configure Web App URL from Google Apps Script" >> $output
    echo "  const googleScriptUrl = \"<?= scriptUrl ?>\";" >> $output
    echo "  if (googleScriptUrl && !googleScriptUrl.startsWith(\"<\" + \"?\")) {" >> $output
    echo "    localStorage.setItem(\"sheet_api_url\", googleScriptUrl);" >> $output
    echo "  }" >> $output
    cat app.js >> $output
    echo "</script>" >> $output
  else
    echo "$line" >> $output
  fi
done < index_src.html

echo "Bundling complete! Output saved to: Index.html"
