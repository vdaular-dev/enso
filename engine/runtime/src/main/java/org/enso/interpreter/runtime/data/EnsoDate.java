package org.enso.interpreter.runtime.data;

import com.oracle.truffle.api.CompilerDirectives;
import com.oracle.truffle.api.interop.InteropLibrary;
import com.oracle.truffle.api.interop.UnsupportedMessageException;
import com.oracle.truffle.api.library.ExportLibrary;
import com.oracle.truffle.api.library.ExportMessage;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalTime;
import org.enso.interpreter.dsl.Builtin;
import org.enso.interpreter.runtime.builtin.BuiltinObject;
import org.enso.polyglot.common_utils.Core_Date_Utils;

@ExportLibrary(InteropLibrary.class)
@Builtin(pkg = "date", name = "Date", stdlibName = "Standard.Base.Data.Time.Date.Date")
public final class EnsoDate extends BuiltinObject {
  private final LocalDate date;

  public EnsoDate(LocalDate date) {
    this.date = date;
  }

  @Override
  protected String builtinName() {
    return "Date";
  }

  @Builtin.Method(description = "Return current Date", autoRegister = false)
  @CompilerDirectives.TruffleBoundary
  public static EnsoDate today() {
    return new EnsoDate(LocalDate.now());
  }

  @Builtin.Method(
      name = "new_builtin",
      description = "Constructs a new Date from a year, month, and day",
      autoRegister = false)
  @Builtin.WrapException(from = DateTimeException.class)
  @CompilerDirectives.TruffleBoundary
  public static EnsoDate create(long year, long month, long day) {
    return new EnsoDate(
        LocalDate.of(Math.toIntExact(year), Math.toIntExact(month), Math.toIntExact(day)));
  }

  @Builtin.Method(name = "year", description = "Gets a value of year")
  public long year() {
    return date.getYear();
  }

  @Builtin.Method(name = "month", description = "Gets a value month")
  public long month() {
    return date.getMonthValue();
  }

  @Builtin.Method(name = "day", description = "Gets a value day")
  public long day() {
    return date.getDayOfMonth();
  }

  @ExportMessage
  boolean isDate() {
    return true;
  }

  @ExportMessage
  LocalDate asDate() {
    return date;
  }

  @ExportMessage
  boolean isTime() {
    return false;
  }

  @ExportMessage
  LocalTime asTime() throws UnsupportedMessageException {
    throw UnsupportedMessageException.create();
  }

  @CompilerDirectives.TruffleBoundary
  @ExportMessage
  @Override
  public Object toDisplayString(boolean allowSideEffects) {
    return Core_Date_Utils.defaultLocalDateFormatter.format(date);
  }
}
