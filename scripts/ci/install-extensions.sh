#!/bin/bash

cd packages/services
func extensions install --javascript

cd ../worker
func extensions install --javascript

