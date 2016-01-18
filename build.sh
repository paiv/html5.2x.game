#!/bin/bash

java -jar bin/compiler.jar -O ADVANCED -W VERBOSE --js js/gf.js --js_output_file js/gf.min.js --externs js/gf.externs.js
