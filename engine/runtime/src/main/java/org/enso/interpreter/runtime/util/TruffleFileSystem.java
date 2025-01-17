package org.enso.interpreter.runtime.util;

import com.oracle.truffle.api.TruffleFile;
import java.io.*;
import java.nio.file.FileVisitResult;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;
import java.util.Queue;
import java.util.stream.Stream;
import org.enso.filesystem.FileSystem;

/** A {@link TruffleFile}-based implementation of {@link FileSystem}. */
public final class TruffleFileSystem implements FileSystem<TruffleFile> {
  private TruffleFileSystem() {}

  public static final TruffleFileSystem INSTANCE = new TruffleFileSystem();

  @Override
  public TruffleFile getChild(TruffleFile parent, String childName) {
    return parent.resolve(childName);
  }

  @Override
  public TruffleFile getParent(TruffleFile path) {
    return path.getParent();
  }

  @Override
  public boolean exists(TruffleFile file) {
    return file.exists();
  }

  @Override
  public void createDirectories(TruffleFile file) throws IOException {
    file.createDirectories();
  }

  @Override
  public TruffleFile relativize(TruffleFile parent, TruffleFile child) {
    return parent.relativize(child);
  }

  @Override
  public List<String> getSegments(TruffleFile file) {
    return Arrays.asList(file.toRelativeUri().getPath().split("/"));
  }

  @Override
  public String getAbsolutePath(TruffleFile file) {
    return file.getAbsoluteFile().getPath();
  }

  @Override
  public String getName(TruffleFile file) {
    return file.getName();
  }

  @Override
  public InputStream newInputStream(TruffleFile file) throws IOException {
    return file.newInputStream();
  }

  @Override
  public OutputStream newOutputStream(TruffleFile file) throws IOException {
    return file.newOutputStream();
  }

  @Override
  public BufferedWriter newBufferedWriter(TruffleFile file) throws IOException {
    return file.newBufferedWriter();
  }

  @Override
  public BufferedReader newBufferedReader(TruffleFile file) throws IOException {
    return file.newBufferedReader();
  }

  @Override
  public Stream<TruffleFile> list(TruffleFile file) throws IOException {
    return file.list().stream();
  }

  @Override
  public Stream<TruffleFile> walk(TruffleFile file) throws IOException {
    Queue<TruffleFile> q = new LinkedList<>();
    file.visit(
        new SimpleFileVisitor<TruffleFile>() {
          @Override
          public FileVisitResult visitFile(TruffleFile file, BasicFileAttributes attrs)
              throws IOException {
            q.add(file);
            return super.visitFile(file, attrs);
          }
        },
        Integer.MAX_VALUE);
    return q.stream();
  }

  @Override
  public boolean isDirectory(TruffleFile file) {
    return file.isDirectory();
  }

  @Override
  public boolean isRegularFile(TruffleFile file) {
    return file.isRegularFile();
  }

  @Override
  public FileTime getCreationTime(TruffleFile file) throws IOException {
    return file.getCreationTime();
  }
}
