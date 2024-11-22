package org.enso.interpreter.runtime.type;

import com.oracle.truffle.api.dsl.TypeSystem;
import com.oracle.truffle.api.interop.ArityException;
import com.oracle.truffle.api.interop.UnsupportedTypeException;
import java.util.Arrays;
import org.enso.interpreter.runtime.callable.UnresolvedConversion;
import org.enso.interpreter.runtime.callable.UnresolvedSymbol;
import org.enso.interpreter.runtime.callable.function.Function;
import org.enso.interpreter.runtime.data.EnsoDate;
import org.enso.interpreter.runtime.data.EnsoDateTime;
import org.enso.interpreter.runtime.data.EnsoDuration;
import org.enso.interpreter.runtime.data.EnsoFile;
import org.enso.interpreter.runtime.data.EnsoTimeOfDay;
import org.enso.interpreter.runtime.data.EnsoTimeZone;
import org.enso.interpreter.runtime.data.ManagedResource;
import org.enso.interpreter.runtime.data.Ref;
import org.enso.interpreter.runtime.data.Type;
import org.enso.interpreter.runtime.data.atom.Atom;
import org.enso.interpreter.runtime.data.atom.AtomConstructor;
import org.enso.interpreter.runtime.data.hash.EnsoHashMap;
import org.enso.interpreter.runtime.data.text.Text;
import org.enso.interpreter.runtime.error.DataflowError;
import org.enso.interpreter.runtime.error.PanicException;
import org.enso.interpreter.runtime.error.PanicSentinel;
import org.enso.interpreter.runtime.number.EnsoBigInteger;
import org.enso.interpreter.runtime.scope.ModuleScope;
import org.enso.interpreter.runtime.warning.Warning;
import org.enso.interpreter.runtime.warning.WarningsLibrary;
import org.enso.interpreter.runtime.warning.WithWarnings;
import org.enso.polyglot.data.TypeGraph;

/**
 * This class defines the interpreter-level type system for Enso.
 *
 * <p>While the language has support for rich types, the interpreter only cares about a small set of
 * primitive-level types in order to make execution fast. All higher-level types can be desugared in
 * terms of the more limited set of types expressed here.
 *
 * <p>By declaring the primitive types here, the interpreter obtains automatically generated
 * utilities for working with them.
 */
@TypeSystem({
  long.class,
  boolean.class,
  double.class,
  Text.class,
  Function.class,
  Atom.class,
  AtomConstructor.class,
  Type.class,
  DataflowError.class,
  UnresolvedConversion.class,
  UnresolvedSymbol.class,
  EnsoBigInteger.class,
  ManagedResource.class,
  ModuleScope.class,
  Ref.class,
  PanicException.class,
  PanicSentinel.class,
  EnsoHashMap.class,
  Warning.class,
  WithWarnings.class,
  WarningsLibrary.class,
  EnsoFile.class,
  EnsoDate.class,
  EnsoDateTime.class,
  EnsoTimeOfDay.class,
  EnsoTimeZone.class,
  EnsoDuration.class
})
public class Types {

  private static final TypeGraph typeHierarchy = buildTypeHierarchy();
  private static final String[] PANIC_TYPE = new String[] {ConstantsGen.PANIC};

  /**
   * A simple pair type
   *
   * @param <A> the type of the first element
   * @param <B> the type of the second element
   */
  public static class Pair<A, B> {
    private final A first;
    private final B second;

    private Pair(A first, B second) {
      this.first = first;
      this.second = second;
    }

    /**
     * Gets the first element.
     *
     * @return the first element.
     */
    public A getFirst() {
      return first;
    }

    /**
     * Gets the second element.
     *
     * @return the second element.
     */
    public B getSecond() {
      return second;
    }
  }

  /**
   * Asserts that the arguments array is empty.
   *
   * @param arguments the arguments array.
   * @throws ArityException if the array is not empty.
   */
  public static void extractArguments(Object[] arguments) throws ArityException {
    if (arguments.length != 0) {
      throw ArityException.create(0, 0, arguments.length);
    }
  }

  /** Check if the given type is a panic. */
  public static boolean isPanic(String[] typeNames) {
    return Arrays.equals(PANIC_TYPE, typeNames);
  }

  /**
   * Asserts that the arguments array has exactly one element of a given type and extracts it.
   *
   * @param arguments the arguments array
   * @param cls the class of the only element
   * @param <A> the type of the only element
   * @return the only element of the array
   * @throws ArityException if the array does not have exactly one element
   * @throws UnsupportedTypeException if the only element is not an instance of {@code cls}
   */
  @SuppressWarnings("unchecked")
  public static <A> A extractArguments(Object[] arguments, Class<A> cls)
      throws ArityException, UnsupportedTypeException {
    if (arguments.length != 1) {
      throw ArityException.create(1, 1, arguments.length);
    }

    if (!(cls.isInstance(arguments[0]))) {
      throw UnsupportedTypeException.create(
          arguments, "The argument must be a " + cls.getSimpleName() + ".");
    }
    return (A) arguments[0];
  }

  /**
   * Asserts that the arguments array has exactly two elements of given types and extracts them.
   *
   * @param arguments the arguments array
   * @param cls1 the class of the first element
   * @param cls2 the class of the second element
   * @param <A> the type of the first element
   * @param <B> the type of the second element
   * @return the pair of elements of the array
   * @throws ArityException if the array does not have exactly two elements
   * @throws UnsupportedTypeException if the elements are not instances of the proper classes
   */
  @SuppressWarnings("unchecked")
  public static <A, B> Pair<A, B> extractArguments(Object[] arguments, Class<A> cls1, Class<B> cls2)
      throws ArityException, UnsupportedTypeException {
    if (arguments.length != 2) {
      throw ArityException.create(2, 2, arguments.length);
    }
    if (!(cls1.isInstance(arguments[0]))) {
      throw UnsupportedTypeException.create(
          arguments, "The first argument must be a " + cls1.getSimpleName() + ".");
    }
    if (!(cls2.isInstance(arguments[1]))) {
      throw UnsupportedTypeException.create(
          arguments, "The second argument must be a " + cls2.getSimpleName() + ".");
    }
    return new Pair<>((A) arguments[0], (B) arguments[1]);
  }

  /**
   * @return the language type hierarchy
   */
  public static TypeGraph getTypeHierarchy() {
    return typeHierarchy;
  }

  private static TypeGraph buildTypeHierarchy() {
    TypeGraph graph = TypeGraph.fromJava(ConstantsGen.ANY);

    graph.insert(ConstantsGen.ARRAY, ConstantsGen.ANY);
    graph.insert(ConstantsGen.BOOLEAN, ConstantsGen.ANY);
    graph.insert(ConstantsGen.FLOAT, ConstantsGen.NUMBER);
    graph.insert(ConstantsGen.ERROR, ConstantsGen.ANY);
    graph.insert(ConstantsGen.FUNCTION, ConstantsGen.ANY);
    graph.insert(ConstantsGen.INTEGER, ConstantsGen.NUMBER);
    graph.insert(ConstantsGen.MANAGED_RESOURCE, ConstantsGen.ANY);
    graph.insert(ConstantsGen.NOTHING, ConstantsGen.ANY);
    graph.insert(ConstantsGen.PANIC, ConstantsGen.ANY);
    graph.insert(ConstantsGen.REF, ConstantsGen.ANY);
    graph.insert(ConstantsGen.TEXT, ConstantsGen.ANY);
    graph.insert(ConstantsGen.DATE, ConstantsGen.ANY);
    graph.insert(ConstantsGen.DATE_TIME, ConstantsGen.ANY);
    graph.insert(ConstantsGen.TIME_OF_DAY, ConstantsGen.ANY);
    graph.insert(ConstantsGen.DURATION, ConstantsGen.ANY);
    graph.insert(ConstantsGen.TIME_ZONE, ConstantsGen.ANY);
    graph.insertWithoutParent(ConstantsGen.PANIC);
    graph.insertWithoutParent(Constants.THUNK);
    graph.insertWithoutParent(Constants.UNRESOLVED_SYMBOL);

    return graph;
  }
}
