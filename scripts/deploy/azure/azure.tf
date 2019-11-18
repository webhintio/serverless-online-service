provider "azurerm" {
  subscription_id = "your_subscription_id"
  client_id       = "your_client_id"
  client_secret   = "your_client_secret"
  tenant_id       = "your_tenant_id"
}

resource "azurerm_resource_group" "rg" {
  name     = "webhint-staging-test"
  location = "eastus"
}

resource "azurerm_app_service_plan" "linuxConsumptionPlan" {
  name                = "LinuxConsumptionPlan"
  location            = "westus"
  resource_group_name = azurerm_resource_group.rg.name
  kind                = "Linux"
  reserved            = true

  sku {
    tier = "Dynamic"
    size = "Y1"
  }
}

resource "azurerm_app_service_plan" "linuxAppServicePlan" {
  name                = "LinuxAppServicePlan"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  kind                = "Linux"
  reserved            = true

  sku {
    tier     = "PremiumV2"
    size     = "P2v2"
    capacity = 3
  }
}

resource "azurerm_container_registry" "acr" {
  name                = "webhintstagingregistrytest"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = true
}

resource "azurerm_servicebus_namespace" "servicebus" {
  name                = "webhint-servicebus-test"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "Standard"
}

resource "azurerm_servicebus_queue" "jobsqueue" {
  name                = "webhint-jobs"
  resource_group_name = azurerm_resource_group.rg.name
  namespace_name      = azurerm_servicebus_namespace.servicebus.name

  dead_lettering_on_message_expiration    = true
  default_message_ttl                     = "P14D"
  duplicate_detection_history_time_window = "PT30S"
  enable_partitioning                     = false
  lock_duration                           = "PT5M"
  max_delivery_count                      = 30
  max_size_in_megabytes                   = 1024
}

resource "azurerm_servicebus_queue" "resultsqueue" {
  name                = "webhint-results"
  resource_group_name = azurerm_resource_group.rg.name
  namespace_name      = azurerm_servicebus_namespace.servicebus.name

  dead_lettering_on_message_expiration    = true
  default_message_ttl                     = "P14D"
  duplicate_detection_history_time_window = "PT30S"
  enable_partitioning                     = false
  lock_duration                           = "PT30S"
  max_delivery_count                      = 10
  max_size_in_megabytes                   = 1024
}

resource "azurerm_cosmosdb_account" "cosmosdb" {
  name                = "webhint-staging-database-test"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  offer_type          = "standard"
  kind                = "MongoDB"

  consistency_policy {
    consistency_level = "session"
  }

  geo_location {
    location          = azurerm_resource_group.rg.location
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_mongo_database" "mongodb" {
  name                = "webhint"
  resource_group_name = azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.cosmosdb.name

  # This will be unnecessary once https://github.com/terraform-providers/terraform-provider-azurerm/pull/4467 is merged and published
  # Once terraform supports throughput in collections we can use the resource azurerm_cosmosdb_mongo_collection
  provisioner "local-exec" {
    command = "./scripts/collections.sh ${azurerm_cosmosdb_account.cosmosdb.name} ${azurerm_cosmosdb_mongo_database.mongodb.name} ${azurerm_resource_group.rg.name}"
  }
}

resource "azurerm_application_insights" "appInsight" {
  name                = "webhint-appinsight"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location

  application_type = "web"
}

resource "azurerm_storage_account" "functionsStorage" {
  name                = "webhintstoragetest"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "Storage"
}

resource "azurerm_function_app" "functionsServices" {
  name                = "service-functions-staging-test"
  resource_group_name = azurerm_resource_group.rg.name
  location            = "westus"

  app_service_plan_id       = azurerm_app_service_plan.linuxConsumptionPlan.id
  storage_connection_string = azurerm_storage_account.functionsStorage.primary_connection_string
  version                   = "~2"

  app_settings = {
    "APPINSIGHTS_INSTRUMENTATIONKEY" = azurerm_application_insights.appInsight.instrumentation_key
    "DatabaseConnection" = replace(
      azurerm_cosmosdb_account.cosmosdb.connection_strings[0],
      "/?",
      "/${azurerm_cosmosdb_mongo_database.mongodb.name}?",
    )
    "FUNCTIONS_WORKER_RUNTIME"     = "node"
    "QueueConnection"              = azurerm_servicebus_namespace.servicebus.default_primary_connection_string
    "WEBSITE_NODE_DEFAULT_VERSION" = "10.14.1"
  }
}

resource "azurerm_function_app" "functionsWorker" {
  name                = "worker-functions-staging-test"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location

  app_service_plan_id       = azurerm_app_service_plan.linuxAppServicePlan.id
  storage_connection_string = azurerm_storage_account.functionsStorage.primary_connection_string
  version                   = "~2"

  site_config {
    always_on        = true
    linux_fx_version = "DOCKER|mcr.microsoft.com/azure-functions/node:2.0"
  }

  app_settings = {
    "APPINSIGHTS_INSTRUMENTATIONKEY"  = azurerm_application_insights.appInsight.instrumentation_key
    "QueueConnection"                 = azurerm_servicebus_namespace.servicebus.default_primary_connection_string
    "WEBSITE_NODE_DEFAULT_VERSION"    = "10.14.1"
    "DOCKER_REGISTRY_SERVER_PASSWORD" = azurerm_container_registry.acr.admin_password
    "DOCKER_REGISTRY_SERVER_URL"      = azurerm_container_registry.acr.login_server
    "DOCKER_REGISTRY_SERVER_USERNAME" = azurerm_container_registry.acr.admin_username
  }
}

