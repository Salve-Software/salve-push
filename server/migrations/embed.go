// Package migrations embeds the server's SQL migration files.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
