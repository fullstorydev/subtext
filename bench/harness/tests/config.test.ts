import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile, loadScenario, loadSuite, listProfiles, listScenarios } from '../config.js';

describe('profile loading', () => {
  it('loads all profiles without error and they have required fields', () => {
    const profileIds = listProfiles();
    assert.ok(profileIds.length >= 5, `Expected at least 5 profiles, got ${profileIds.length}`);
    for (const id of profileIds) {
      const profile = loadProfile(id);
      assert.ok(profile.runner, `Profile ${id} missing runner field`);
      assert.ok(typeof profile.prompt_insert === 'string', `Profile ${id} missing prompt_insert field`);
    }
  });

  it('throws with meaningful error for nonexistent profile', () => {
    assert.throws(
      () => loadProfile('nonexistent'),
      /Profile not found: nonexistent/,
    );
  });
});

describe('scenario loading', () => {
  it('loads all scenarios without error and they have required fields', () => {
    const scenarioIds = listScenarios();
    assert.ok(scenarioIds.length >= 1, 'Expected at least 1 scenario');
    for (const id of scenarioIds) {
      const scenario = loadScenario(id);
      assert.ok(scenario.task, `Scenario ${id} missing task field`);
      assert.ok(scenario.acceptance_criteria, `Scenario ${id} missing acceptance_criteria field`);
    }
  });

  it('throws with meaningful error for nonexistent scenario', () => {
    assert.throws(
      () => loadScenario('nonexistent'),
      /Scenario not found: nonexistent/,
    );
  });
});

describe('suite definitions', () => {
  it('all suite scenario references exist as files', () => {
    const existingScenarios = new Set(listScenarios());
    for (const suiteId of ['trained', 'blind', 'all']) {
      const suite = loadSuite(suiteId);
      for (const scenarioId of suite.scenarios) {
        assert.ok(
          existingScenarios.has(scenarioId),
          `Suite "${suiteId}" references scenario "${scenarioId}" which does not exist as a file`,
        );
      }
    }
  });
});
