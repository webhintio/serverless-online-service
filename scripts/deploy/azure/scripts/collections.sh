#!/bin/sh

az cosmosdb mongodb collection create --account-name $1 --database-name $2 --name status --resource-group $3 --shard _id --throughput 5000
az cosmosdb mongodb collection create --account-name $1 --database-name $2 --name jobs --resource-group $3 --shard _id --throughput 5000
az cosmosdb mongodb collection create --account-name $1 --database-name $2 --name serviceconfigs --resource-group $3 --shard _id --throughput 5000
