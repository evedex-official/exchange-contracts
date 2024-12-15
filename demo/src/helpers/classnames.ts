const hasOwn = {}.hasOwnProperty;

export default function classNames(...args: any[]) {
  let classes = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg) {
      classes = appendClass(classes, parseValue(arg));
    }
  }

  return classes;
}

function parseValue(arg: any) {
  if (typeof arg === "string") {
    return arg;
  }

  if (typeof arg !== "object") {
    return "";
  }

  if (Array.isArray(arg)) {
    return classNames.apply(null, arg as []);
  }

  if (
    arg.toString !== Object.prototype.toString &&
    !arg.toString.toString().includes("[native code]")
  ) {
    return arg.toString();
  }

  let classes = "";

  for (const key in arg) {
    if (hasOwn.call(arg, key) && arg[key]) {
      classes = appendClass(classes, key);
    }
  }

  return classes;
}

function appendClass(value: any, newClass: any) {
  if (!newClass) {
    return value;
  }

  return value ? value + " " + newClass : newClass;
}
