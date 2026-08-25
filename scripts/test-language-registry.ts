import { strict as assert } from "node:assert";
import {
  LANGUAGE_DEFINITIONS,
  getLanguageDefinition,
  getProviderCapabilities,
  isSupportedLanguagePair
} from "../lib/languages/registry";
import {
  DEFAULT_LANGUAGE_PROFILE,
  getListeningDirection,
  getProfileLanguageOptions,
  getPushToTalkDirection,
  parseLanguageProfile,
  serializeLanguageProfile,
  validateLanguageProfile
} from "../lib/languages/profile";
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
  const conversationPair = getListeningDirection(DEFAULT_LANGUAGE_PROFILE);
  const pushToTalkPair = getPushToTalkDirection(DEFAULT_LANGUAGE_PROFILE);

  assert.deepEqual(conversationPair, {
    sourceLanguage: "ja",
    targetLanguage: "zh"
  });
  assert.deepEqual(pushToTalkPair, {
    sourceLanguage: "zh",
    targetLanguage: "ja"
  });
}

function testDefaultProfile(): void {
  assert.deepEqual(DEFAULT_LANGUAGE_PROFILE, {
    userLanguage: "zh",
    peerLanguage: "ja"
  });
}

function testEnglishUserProfileDirections(): void {
  const profile = {
    userLanguage: "en",
    peerLanguage: "zh"
  };

  assert.deepEqual(getListeningDirection(profile), {
    sourceLanguage: "zh",
    targetLanguage: "en"
  });
  assert.deepEqual(getPushToTalkDirection(profile), {
    sourceLanguage: "en",
    targetLanguage: "zh"
  });
}

function testLanguageProfileRejected(): void {
  const capabilities = getProviderCapabilities("bailian");
  const sameLanguageResult = validateLanguageProfile(
    {
      userLanguage: "zh",
      peerLanguage: "zh"
    },
    capabilities
  );
  const unsupportedResult = validateLanguageProfile(
    {
      userLanguage: "zh",
      peerLanguage: "fr"
    },
    capabilities
  );

  assert.equal(sameLanguageResult.ok, false);
  assert.equal(unsupportedResult.ok, false);
}

function testPersistedProfileRestored(): void {
  const profile = {
    userLanguage: "en",
    peerLanguage: "zh"
  };

  assert.deepEqual(parseLanguageProfile(serializeLanguageProfile(profile)), profile);
  assert.equal(parseLanguageProfile("{not json"), null);
}

function testSelectorOptionsComeFromCapabilities(): void {
  const capabilities = getProviderCapabilities("bailian");
  const options = getProfileLanguageOptions(capabilities);
  const optionCodes = options.map((option) => option.code);

  assert.deepEqual(optionCodes.sort(), ["en", "ja", "zh"]);
}

function testGatewayProtocolPairNotReversed(): void {
  assert.deepEqual(getProviderSessionLanguages("conversation", "ja", "zh"), {
    sourceLanguage: "ja",
    targetLanguage: "zh"
  });
  assert.deepEqual(getProviderSessionLanguages("push_to_talk", "zh", "ja"), {
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
  testDefaultProfile();
  testPushToTalkReverseDirection();
  testEnglishUserProfileDirections();
  testLanguageProfileRejected();
  testPersistedProfileRestored();
  testSelectorOptionsComeFromCapabilities();
  testGatewayProtocolPairNotReversed();

  console.log("Language registry tests: passed");
}

main();
