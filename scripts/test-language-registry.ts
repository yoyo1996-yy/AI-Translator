import { strict as assert } from "node:assert";
import {
  LANGUAGE_DEFINITIONS,
  getLanguageDefinition,
  getProviderCapabilities,
  isSupportedLanguagePair
} from "../lib/languages/registry";
import { getProviderSessionLanguages, validateProviderLanguagePair } from "../server/language-session";

function testUniqueLanguageCodes(): void {
  const codes = LANGUAGE_DEFINITIONS.map((language) => language.code);
  assert.equal(new Set(codes).size, codes.length);
}

function testValidatedLanguageDefinitions(): void {
  for (const code of ["zh", "ja", "en"]) {
    const definition = getLanguageDefinition(code);

    assert.ok(definition, `${code} definition should exist.`);
    assert.equal(definition.enabled, true);
    assert.ok(definition.displayName);
    assert.ok(definition.nativeName);
  }
}

function testSourceEqualsTargetRejected(): void {
  const capabilities = getProviderCapabilities("bailian");
  const result = validateProviderLanguagePair("bailian", capabilities, "push_to_talk", "zh", "zh");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.gatewayCode, "same_language_pair");
  }
}

function testSupportedPairAccepted(): void {
  const capabilities = getProviderCapabilities("bailian");
  const result = validateProviderLanguagePair("bailian", capabilities, "push_to_talk", "zh", "ja");

  assert.equal(result.ok, true);
  assert.equal(isSupportedLanguagePair(capabilities, { sourceLanguage: "zh", targetLanguage: "ja" }), true);
}

function testUnsupportedPairRejected(): void {
  const capabilities = getProviderCapabilities("bailian");
  const result = validateProviderLanguagePair("bailian", capabilities, "push_to_talk", "fr", "zh");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.gatewayCode, "unsupported_language_pair");
  }
}

function testProviderSpecificMappingIsNotInRegistry(): void {
  for (const definition of LANGUAGE_DEFINITIONS) {
    assert.equal("providerCode" in definition, false);
    assert.equal("bailianCode" in definition, false);
    assert.equal("qwenCode" in definition, false);
    assert.equal("dashScopeCode" in definition, false);
  }
}

function testPushToTalkReverseDirection(): void {
  const conversationPair = getProviderSessionLanguages("conversation", "zh", "ja");
  const pushToTalkPair = getProviderSessionLanguages("push_to_talk", "zh", "ja");

  assert.deepEqual(conversationPair, {
    sourceLanguage: "ja",
    targetLanguage: "zh"
  });
  assert.deepEqual(pushToTalkPair, {
    sourceLanguage: "zh",
    targetLanguage: "ja"
  });
}

function main(): void {
  testUniqueLanguageCodes();
  testValidatedLanguageDefinitions();
  testSourceEqualsTargetRejected();
  testSupportedPairAccepted();
  testUnsupportedPairRejected();
  testProviderSpecificMappingIsNotInRegistry();
  testPushToTalkReverseDirection();

  console.log("Language registry tests: passed");
}

main();
