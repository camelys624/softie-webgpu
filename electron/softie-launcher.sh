#!/bin/sh
set -eu
exec /usr/bin/electron /usr/lib/softie-desktop/electron/main.cjs "$@"
