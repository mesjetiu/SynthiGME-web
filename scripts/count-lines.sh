#!/bin/bash


# Cuenta líneas de código del proyecto
# Excluye: docs (compilado), node_modules, local, experiments, dist, build, out, dist-electron, dist-app, .cache, .parcel-cache, .turbo, coverage, test-results, synthiGME-implementation-study, .release-cache
# Solo cuenta archivos en el directorio raíz y subcarpetas relevantes (no builds ni carpetas ignoradas)

cloc . \
	--exclude-dir=docs,node_modules,local,experiments,dist,build,out,dist-electron,dist-app,.cache,.parcel-cache,.turbo,coverage,test-results,synthiGME-implementation-study,.release-cache \
	--not-match-d="^\\./(docs|node_modules|local|experiments|dist|build|out|dist-electron|dist-app|.cache|.parcel-cache|.turbo|coverage|test-results|synthiGME-implementation-study|.release-cache)($|/)" \
	--exclude-ext=svg
