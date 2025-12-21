#!/bin/bash

# Count lines of code in the project
# Excludes: docs (compiled from src), node_modules, local, experiments

cloc . --exclude-dir=docs,node_modules,local,experiments
