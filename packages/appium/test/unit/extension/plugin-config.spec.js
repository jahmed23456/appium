// @ts-check

import { promises as fs } from 'fs';
import { getManifestInstance } from '../../../lib/extension/manifest';
import { resetSchema } from '../../../lib/schema';
import { resolveFixture, rewiremock } from '../../helpers';
import { initMocks } from './mocks';

const {expect} = chai;

describe('PluginConfig', function () {

  /** @type {string} */
  let yamlFixture;

  before(async function () {
    yamlFixture = await fs.readFile(resolveFixture('extensions.yaml'), 'utf8');
  });

  /**
 * @type {Manifest}
 */
  let manifest;

  /** @type {sinon.SinonSandbox} */
  let sandbox;

  /** @type {import('./mocks').AppiumSupportMocks} */
  let AppiumSupportMocks;
  /** @type {import('./mocks').ResolveFromMocks} */
  let ResolveFromMocks;

  /**
   * @type {typeof import('../../../lib/extension/plugin-config').PluginConfig}
   */
  let PluginConfig;

  beforeEach(function () {
    manifest = getManifestInstance('/somewhere/');
    const mocks = initMocks();
    AppiumSupportMocks = mocks.AppiumSupportMocks;
    ResolveFromMocks = mocks.ResolveFromMocks;
    sandbox = mocks.sandbox;
    AppiumSupportMocks.fs.readFile.resolves(yamlFixture);
    PluginConfig = rewiremock.proxy(
      () => require('../../../lib/extension/plugin-config'),
      {'@appium/support': AppiumSupportMocks, 'resolve-from': ResolveFromMocks},
    ).PluginConfig;
    resetSchema();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('extensionDesc()', function () {
    it('should return the description of the extension', function () {
      expect(
        PluginConfig.create(manifest).extensionDesc('foo', {
          version: '1.0',
          mainClass: 'Barrggh',
          pkgName: 'herrbbbff',
          installType: 'npm',
          installSpec: 'herrbbbff',
        }),
      ).to.equal(`foo@1.0`);
    });
  });

  describe('getConfigProblems()', function () {
    /**
     * @type {PluginConfig}
     */
    let pluginConfig;

    beforeEach(function () {
      pluginConfig = PluginConfig.create(manifest);
    });

    describe('when provided no arguments', function () {
      it('should not throw', function () {
        // @ts-expect-error
        expect(() => pluginConfig.getConfigProblems()).not.to.throw();
      });
    });
  });

  describe('getSchemaProblems()', function () {
    /**
     * @type {PluginConfig}
     */
    let pluginConfig;

    beforeEach(function () {
      pluginConfig = PluginConfig.create(manifest);
    });

    describe('when provided an object with a defined `schema` property of unsupported type', function () {
      it('should return an array having an associated problem', function () {
        expect(
          pluginConfig.getSchemaProblems(
            // @ts-expect-error
            {
              schema: [],
              mainClass: 'Asdsh',
              pkgName: 'yodel',
              version: '-1',
            },
            'foo',
          ),
        ).to.deep.include({
          err: 'Incorrectly formatted schema field; must be a path to a schema file or a schema object.',
          val: [],
        });
      });
    });

    describe('when provided a string `schema` property', function () {
      describe('when the property ends in an unsupported extension', function () {
        it('should return an array having an associated problem', function () {
          expect(
            pluginConfig.getSchemaProblems(
              {
                schema: 'selenium.java',
                mainClass: 'Asdsh',
                pkgName: 'yodel',
                version: '-1',
                installType: 'npm',
                installSpec: 'yodel',
              },
              'foo',
            ),
          ).to.deep.include({
            err: 'Schema file has unsupported extension. Allowed: .json, .js, .cjs',
            val: 'selenium.java',
          });
        });
      });

      describe('when the property contains a supported extension', function () {
        describe('when the property as a path cannot be found', function () {
          it('should return an array having an associated problem', function () {
            expect(
              pluginConfig.getSchemaProblems(
                // @ts-expect-error
                {
                  pkgName: 'doop',
                  schema: 'herp.json',
                  mainClass: 'Yankovic',
                  version: '1.0.0',
                },
                'foo',
              ),
            )
              .with.nested.property('[0].err')
              .to.match(/Unable to register schema at path herp\.json/i);
          });
        });

        describe('when the property as a path is found', function () {
          beforeEach(function () {
            ResolveFromMocks.returns(resolveFixture('plugin.schema'));
          });

          it('should return an empty array', function () {
            expect(
              pluginConfig.getSchemaProblems(
                // @ts-expect-error
                {
                  pkgName: '../fixtures',
                  schema: 'plugin.schema.js',
                  mainClass: 'Yankovic',
                  version: '1.0.0',
                },
                'foo',
              ),
            ).to.be.empty;
          });
        });
      });
    });

    describe('when provided an object `schema` property', function () {
      /** @type {ExtDataWithSchema<PluginType>} */
      let externalManifest;

      describe('when the object is a valid schema', function () {
        beforeEach(function () {
          externalManifest = {
            pkgName: 'foo',
            version: '1.0.0',
            installSpec: 'foo',
            installType: 'npm',
            mainClass: 'Barrggh',
            schema: {type: 'object', properties: {foo: {type: 'string'}}},
          };
        });

        it('should return an empty array', function () {
          expect(pluginConfig.getSchemaProblems(externalManifest, 'foo')).to.be
            .empty;
        });
      });

      describe('when the object is an invalid schema', function () {
        beforeEach(function () {
          externalManifest = {
            pkgName: 'foo',
            version: '1.0.0',
            installSpec: 'foo',
            installType: 'npm',
            mainClass: 'Barrggh',
            schema: {
              type: 'object',
              properties: {foo: {type: 'string'}},
              // @ts-expect-error
              $async: true, // this is not allowed
            },
          };
        });

        it('should return an array having an associated problem', function () {
          expect(pluginConfig.getSchemaProblems(externalManifest, 'foo'))
            .with.nested.property('[0].err')
            .to.match(/Unsupported schema/i);
        });
      });
    });
  });

  describe('readExtensionSchema()', function () {
    /**
     * @type {PluginConfig}
     */
    let pluginConfig;

    /** @type {ExtDataWithSchema<PluginType>} */
    let extData;

    const extName = 'stuff';

    beforeEach(function () {
      extData = {
        pkgName: 'some-pkg',
        schema: 'plugin.schema.js',
        mainClass: 'SomeClass',
        version: '0.0.0',
        installType: 'npm',
        installSpec: 'some-pkg',
      };
      ResolveFromMocks.returns(resolveFixture('plugin.schema.js'));
      pluginConfig = PluginConfig.create(manifest);
    });

    describe('when the extension data is missing `schema`', function () {
      it('should throw', function () {
        // @ts-expect-error
        delete extData.schema;
        expect(() =>
          pluginConfig.readExtensionSchema(extName, extData),
        ).to.throw(TypeError, /why is this function being called/i);
      });
    });

    describe('when the extension schema has already been registered', function () {
      describe('when the schema is identical (presumably the same extension)', function () {
        it('should not throw', function () {
          pluginConfig.readExtensionSchema(extName, extData);
          expect(() =>
            pluginConfig.readExtensionSchema(extName, extData),
          ).not.to.throw();
        });
      });

      describe('when the schema differs (presumably a different extension)', function () {
        it('should throw', function () {
          pluginConfig.readExtensionSchema(extName, extData);
          ResolveFromMocks.returns(resolveFixture('driver.schema.js'));
          expect(() =>
            pluginConfig.readExtensionSchema(extName, extData),
          ).to.throw(/conflicts with an existing schema/i);
        });
      });
    });

    describe('when the extension schema has not yet been registered', function () {
      it('should resolve and load the extension schema file', function () {
        pluginConfig.readExtensionSchema(extName, extData);
        expect(ResolveFromMocks).to.have.been.calledOnce;
      });
    });
  });
});

/**
 * @typedef {import('../../../lib/extension/manifest').Manifest} Manifest
 * @typedef {import('../../../lib/extension/manifest').PluginType} PluginType
 * @typedef {import('../../../lib/extension/plugin-config').PluginConfig} PluginConfig
 */

/**
 * @template {import('../../../lib/extension/manifest').ExtensionType} ExtType
 * @typedef {import('../../../lib/extension/manifest').ExtDataWithSchema<ExtType>} ExtDataWithSchema
 */
