#!/bin/bash
cd "$(dirname "$0")"
{ echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">'; cat dist/page.html; echo '</body></html>'; } > dist/test.html
