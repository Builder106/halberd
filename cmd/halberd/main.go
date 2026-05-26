// Command halberd is the operator CLI: `halberd lint policy.yaml` validates a
// policy bundle without starting the proxy. More subcommands (replay, test)
// land in later phases.
package main

import (
	"fmt"
	"os"

	"github.com/Builder106/halberd/internal/policy"
)

const version = "0.1.0-dev"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "lint":
		os.Exit(cmdLint(os.Args[2:]))
	case "version", "--version", "-v":
		fmt.Println(version)
	case "help", "--help", "-h":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "unknown subcommand: %s\n", os.Args[1])
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `halberd — policy operator CLI

Usage:
  halberd lint <policy.yaml>     validate a policy bundle
  halberd version                print version
  halberd help                   print this message`)
}

func cmdLint(args []string) int {
	if len(args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: halberd lint <policy.yaml>")
		return 2
	}
	b, err := policy.LoadBundle(args[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "FAIL %s: %v\n", args[0], err)
		return 1
	}
	fmt.Printf("OK %s (server=%q, tools=%d)\n", args[0], b.Server, len(b.Tools))
	return 0
}
