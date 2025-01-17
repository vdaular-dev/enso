package org.enso.compiler.test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Paths;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import org.enso.common.LanguageInfo;
import org.enso.common.MethodNames;
import org.enso.common.RuntimeOptions;
import org.enso.interpreter.runtime.EnsoContext;
import org.enso.pkg.PackageManager;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.io.IOAccess;
import org.junit.Test;

public class SerializerTest {
  public Context ensoContextForPackage(String name, File pkgFile) throws IOException {
    Context ctx =
        Context.newBuilder()
            .allowExperimentalOptions(true)
            .allowIO(IOAccess.ALL)
            .option(RuntimeOptions.PROJECT_ROOT, pkgFile.getAbsolutePath())
            .option(
                RuntimeOptions.LANGUAGE_HOME_OVERRIDE,
                Paths.get("../../distribution/component").toFile().getAbsolutePath())
            .option(RuntimeOptions.LOG_LEVEL, Level.WARNING.getName())
            .logHandler(System.err)
            .allowAllAccess(true)
            .build();
    assertNotNull("Enso language is supported", ctx.getEngine().getLanguages().get("enso"));
    return ctx;
  }

  @Test
  public void testSerializationOfFQNs() throws Exception {
    var testName = "Test_Serializer_FQN";
    var pkgPath = new File(getClass().getClassLoader().getResource(testName).getPath());
    var pkg = PackageManager.Default().fromDirectory(pkgPath).get();

    try (var ctx = ensoContextForPackage(testName, pkgPath)) {
      var ensoContext =
          (EnsoContext)
              ctx.getBindings(LanguageInfo.ID)
                  .invokeMember(MethodNames.TopScope.LEAK_CONTEXT)
                  .asHostObject();
      var mainModuleOpt = ensoContext.getModuleForFile(pkg.mainFile());
      assertEquals(mainModuleOpt.isPresent(), true);

      var compiler = ensoContext.getCompiler();
      var module = mainModuleOpt.get().asCompilerModule();

      ctx.enter();
      var result = compiler.run(module);
      assertEquals(result.compiledModules().exists(m -> m == module), true);
      var useThreadPool = compiler.context().isCreateThreadAllowed();
      var future = compiler.context().serializeModule(compiler, module, true, useThreadPool);
      var serialized = future.get(5, TimeUnit.SECONDS);
      assertEquals(serialized, true);
      var deserialized = compiler.context().deserializeModule(compiler, module);
      assertTrue("Deserialized", deserialized);
      compiler.context().shutdown(true);
      ctx.leave();
    }
  }
}
