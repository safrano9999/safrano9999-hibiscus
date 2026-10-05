// Source of truth: SCRIPTS/githubactions. Generated copies are overwritten.
// CI-only observer: read the real server setting after its empty profile is ready.
// Does not change settings, invoke a banking callback, or start synchronization.
import java.lang.instrument.Instrumentation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

public class VoPDefaultProbe {
    public static void premain(String directory, Instrumentation instrumentation) {
        Thread observer = new Thread(() -> {
            Path ready = Path.of(directory, "ready");
            Path result = Path.of(directory, "result");
            long deadline = System.nanoTime() + Duration.ofMinutes(2).toNanos();
            try {
                while (!Files.exists(ready)) {
                    if (System.nanoTime() >= deadline) throw new IllegalStateException("Server readiness timed out");
                    Thread.sleep(100);
                }
                for (Class<?> type : instrumentation.getAllLoadedClasses()) {
                    if (!type.getName().equals("de.willuhn.jameica.hbci.payment.Settings")) continue;
                    Object value = type.getMethod("isVoPApprove").invoke(null);
                    Files.writeString(result, value.toString());
                    return;
                }
                throw new IllegalStateException("Hibiscus Server Settings class not loaded");
            } catch (Throwable error) {
                try { Files.writeString(result, "ERROR: " + error); }
                catch (Exception ignored) { error.printStackTrace(); }
            }
        }, "ci-vop-default-observer");
        observer.setDaemon(true);
        observer.start();
    }
}
