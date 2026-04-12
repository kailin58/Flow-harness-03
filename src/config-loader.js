const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ConfigLoader {
  constructor(configPath = '.flowharness/config.yml') {
    this.configPath = configPath;
    this.config = null;
  }

  load() {
    try {
      const fullPath = path.resolve(process.cwd(), this.configPath);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`Config file not found: ${fullPath}`);
      }

      const fileContents = fs.readFileSync(fullPath, 'utf8');
      this.config = yaml.load(fileContents);

      this.validate();
      return this.config;
    } catch (error) {
      throw new Error(`Failed to load config: ${error.message}`);
    }
  }

  validate() {
    if (!this.config.version) {
      throw new Error('Config must have a version field');
    }

    if (!this.config.workflows || !Array.isArray(this.config.workflows)) {
      throw new Error('Config must have a workflows array');
    }

    if (!this.config.policies) {
      throw new Error('Config must have a policies object');
    }
  }

  getWorkflow(name) {
    return this.config.workflows.find(w => w.name === name);
  }

  getPolicies() {
    return this.config.policies;
  }

  getLearningConfig() {
    return this.config.learning || { enabled: false };
  }

  getObservabilityConfig() {
    return this.config.observability || { logging: { enabled: false } };
  }

  getHooks() {
    return this.config.hooks || {};
  }
}

module.exports = ConfigLoader;
