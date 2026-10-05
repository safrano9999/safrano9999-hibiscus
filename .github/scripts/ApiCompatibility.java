// Source of truth: SCRIPTS/githubactions. Generated copies are overwritten.
// Resolve every HBCI4Java method/field referenced by the bundled plugin bytecode.
// Runs only in the GitHub Actions build, without initializing classes or banking.
import java.io.*;
import java.lang.invoke.MethodType;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;

class ApiCompatibility {
    static final Set<String> checked = new HashSet<>();
    static final List<String> errors = new ArrayList<>();

    static boolean member(Class<?> owner, String name, String descriptor, boolean field) {
        if (owner == null) return false;
        if (field) {
            for (Field f : owner.getDeclaredFields())
                if (f.getName().equals(name) && f.getType().descriptorString().equals(descriptor)) return true;
        } else if (name.equals("<init>")) {
            for (Constructor<?> c : owner.getDeclaredConstructors())
                if (MethodType.methodType(void.class, c.getParameterTypes()).descriptorString().equals(descriptor)) return true;
            return false;
        } else {
            for (Method m : owner.getDeclaredMethods())
                if (m.getName().equals(name) && MethodType.methodType(m.getReturnType(), m.getParameterTypes()).descriptorString().equals(descriptor)) return true;
        }
        for (Class<?> i : owner.getInterfaces())
            if (member(i, name, descriptor, field)) return true;
        // JVM interface method resolution also includes public Object methods.
        return member(owner.isInterface() ? Object.class : owner.getSuperclass(), name, descriptor, field);
    }

    static void scan(InputStream stream, String consumer) throws Exception {
        var in = new DataInputStream(stream);
        if (in.readInt() != 0xcafebabe) throw new IOException("Invalid class: " + consumer);
        in.readUnsignedShort(); in.readUnsignedShort();
        int count = in.readUnsignedShort();
        Object[] pool = new Object[count];
        int[] tags = new int[count];
        for (int n = 1; n < count; n++) {
            int tag = tags[n] = in.readUnsignedByte();
            switch (tag) {
                case 1 -> pool[n] = in.readUTF();
                case 3, 4 -> in.readInt();
                case 5, 6 -> { in.readLong(); n++; }
                case 7, 8, 16, 19, 20 -> pool[n] = in.readUnsignedShort();
                case 9, 10, 11, 12, 17, 18 -> pool[n] = new int[]{in.readUnsignedShort(), in.readUnsignedShort()};
                case 15 -> { in.readUnsignedByte(); in.readUnsignedShort(); }
                default -> throw new IOException("Unknown constant tag " + tag);
            }
        }
        for (int n = 1; n < count; n++) {
            if (tags[n] < 9 || tags[n] > 11) continue;
            int[] ref = (int[]) pool[n];
            String owner = (String) pool[(int) pool[ref[0]]];
            if (!owner.startsWith("org/kapott/hbci/")) continue;
            int[] pair = (int[]) pool[ref[1]];
            String name = (String) pool[pair[0]], descriptor = (String) pool[pair[1]];
            String key = tags[n] + ":" + owner + "." + name + descriptor;
            if (!checked.add(key)) continue;
            try {
                Class<?> type = Class.forName(owner.replace('/', '.'), false, ApiCompatibility.class.getClassLoader());
                if (!member(type, name, descriptor, tags[n] == 9)) errors.add(consumer + ": " + key);
            } catch (LinkageError | ReflectiveOperationException e) {
                errors.add(consumer + ": " + key + " -> " + e);
            }
        }
    }

    public static void main(String[] args) throws Exception {
        try (var files = Files.walk(Path.of(args[0]))) {
            for (Path path : files.filter(p -> p.toString().endsWith(".jar") && !p.getFileName().toString().startsWith("hbci4j-core-")).toList()) {
                try (var jar = new JarFile(path.toFile())) {
                    for (var entry : Collections.list(jar.entries())) {
                        if (!entry.getName().endsWith(".class")) continue;
                        try (var data = jar.getInputStream(entry)) { scan(data, path.getFileName() + "/" + entry.getName()); }
                    }
                }
            }
        }
        if (checked.size() < 100) throw new AssertionError("Too few banking API references: " + checked.size());
        if (!errors.isEmpty()) throw new AssertionError(String.join("\n", errors));
        System.out.println("HBCI4Java 4.1.17: resolved " + checked.size() + " plugin API references");
    }
}
