/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { maskTemplates } from '../src/languageservice/parser/templateMasking';
import { yamlDocumentsCache } from '../src/languageservice/parser/yaml-documents';
import { TextDocument } from 'vscode-languageserver-textdocument';
import assert from 'assert';

const HELM_CHART = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: {{ include "mychart.fullname" . }}',
  '  labels:',
  '    {{- include "mychart.labels" . | nindent 4 }}',
  'spec:',
  '  {{- if not .Values.autoscaling.enabled }}',
  '  replicas: {{ .Values.replicaCount }}',
  '  {{- end }}',
  '  selector:',
  '    matchLabels:',
  '      app: {{ .Chart.Name }}',
  '',
].join('\n');

function errorCount(text: string, template: 'none' | 'helm'): number {
  yamlDocumentsCache.clear();
  yamlDocumentsCache.configure({ template });
  const doc = TextDocument.create('file://foo/bar.yaml', 'yaml', 1, text);
  return yamlDocumentsCache.getYamlDocument(doc).documents.reduce((n, d) => n + d.errors.length, 0);
}

describe('Template masking', () => {
  afterEach(() => {
    yamlDocumentsCache.clear();
    yamlDocumentsCache.configure({ template: 'none' });
  });

  it('should leave text without templates untouched', () => {
    const text = 'foo: bar\nbaz:\n  - 1\n';
    assert.strictEqual(maskTemplates(text), text);
  });

  it('should preserve length and line count', () => {
    const masked = maskTemplates(HELM_CHART);
    assert.strictEqual(masked.length, HELM_CHART.length);
    assert.strictEqual(masked.split('\n').length, HELM_CHART.split('\n').length);
  });

  it('should comment out a template-only line, keeping indentation', () => {
    const template = '  {{- if .Values.enabled }}';
    const masked = maskTemplates(`spec:\n${template}\n  foo: bar`);
    const middle = masked.split('\n')[1];
    assert.strictEqual(middle, '  #' + ' '.repeat(template.length - 3));
    assert.strictEqual(middle.length, template.length);
  });

  it('should replace an inline expression with a filler scalar', () => {
    const masked = maskTemplates('name: {{ .Values.name }}');
    assert.strictEqual(masked, 'name: xxxxxxxxxxxxxxxxxx');
  });

  it('should mask a span crossing line boundaries', () => {
    const text = 'a: {{ multi\nline }}\nb: plain';
    const masked = maskTemplates(text);
    assert.strictEqual(masked.length, text.length);
    assert.strictEqual(masked, 'a: xxxxxxxx\n#      \nb: plain');
  });

  it('should mask an unclosed span to the end of its line', () => {
    const text = 'a: {{ unclosed\nb: plain';
    const masked = maskTemplates(text);
    assert.strictEqual(masked.length, text.length);
    assert.strictEqual(masked, 'a: xxxxxxxxxxx\nb: plain');
  });

  it('should not affect a quoted expression beyond keeping it a string', () => {
    const masked = maskTemplates('name: "{{ .Values.name }}"');
    assert.strictEqual(masked, 'name: "xxxxxxxxxxxxxxxxxx"');
  });

  it('should produce parse errors on a Helm chart when disabled', () => {
    assert.ok(errorCount(HELM_CHART, 'none') > 0);
  });

  it('should produce no parse errors on a Helm chart when enabled', () => {
    assert.strictEqual(errorCount(HELM_CHART, 'helm'), 0);
  });

  it('should keep offsets valid so nodes map back to the real document', () => {
    yamlDocumentsCache.clear();
    yamlDocumentsCache.configure({ template: 'helm' });
    const doc = TextDocument.create('file://foo/bar.yaml', 'yaml', 1, HELM_CHART);
    const root = yamlDocumentsCache.getYamlDocument(doc).documents[0].root;
    const kind = root.children.find((c) => c.children?.[0]?.value === 'kind');
    assert.strictEqual(HELM_CHART.substr(kind.offset, kind.length), 'kind: Deployment');
  });

  it('should re-parse when the template mode changes on an unchanged document', () => {
    const doc = TextDocument.create('file://foo/bar.yaml', 'yaml', 1, HELM_CHART);
    yamlDocumentsCache.clear();
    yamlDocumentsCache.configure({ template: 'none' });
    assert.ok(yamlDocumentsCache.getYamlDocument(doc).documents.reduce((n, d) => n + d.errors.length, 0) > 0);
    yamlDocumentsCache.configure({ template: 'helm' });
    assert.strictEqual(
      yamlDocumentsCache.getYamlDocument(doc).documents.reduce((n, d) => n + d.errors.length, 0),
      0
    );
  });
});
