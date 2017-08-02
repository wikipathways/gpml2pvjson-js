interface Opt {
  lowercase?: any;
  looseCase?: any;
  xmlns?: boolean;
  position?: number;
  trim?: boolean;
}

declare type SAXEVENTS =
  | "text"
  | "processinginstruction"
  | "sgmldeclaration"
  | "doctype"
  | "comment"
  | "opentagstart"
  | "attribute"
  | "opentag"
  | "closetag"
  | "opencdata"
  | "cdata"
  | "closecdata"
  | "error"
  | "end"
  | "ready"
  | "script"
  | "opennamespace"
  | "closenamespace";

declare module "sax" {
  export function createStream<ATTR_NAMES_AND_TYPES>(
    strict: boolean,
    opt: Opt
  ): SAXStreamInstance<ATTR_NAMES_AND_TYPES>;
  export function parser(strict: boolean, opt: Opt): void;
  export type EVENTS = SAXEVENTS;
  export const MAX_BUFFER_LENGTH = 65536;
}

interface SAXAttribute<K, T> {
  name: K;
  value: T;
}

interface SAXOpenTag<ATTR_NAMES_AND_TYPES> {
  name: string;
  prefix?: string;
  local?: string;
  uri?: string;
  ns?: string;
  isSelfClosing: boolean;
  attributes: {
    [K in keyof ATTR_NAMES_AND_TYPES]?: SAXAttribute<K, ATTR_NAMES_AND_TYPES[K]>
  };
}

// TODO items listed as any could probably be tightened up
declare class SAXParser<ATTR_NAMES_AND_TYPES> {
  q: "";
  c: "";
  bufferCheckPosition: number;
  opt: Opt;
  tags: any[];
  closed: false;
  closedRoot: false;
  sawRoot: false;
  tag: null;
  error: null;
  strict: boolean;
  noscript: boolean;
  state: any;
  strictEntities: boolean;
  ENTITITIES: any;
  attribList: any[];
  ns?: any;
  trackPosition: boolean;
  line: number;
  column: number;
  constructor(strict: boolean, opt: Opt);
}

// TODO is this the right way to indicate an instance of class SAXStream?
interface SAXStreamInstance<ATTR_NAMES_AND_TYPES> extends SAXStream<
  ATTR_NAMES_AND_TYPES
> {
  _parser: {
    error: any;
    resume: Function;
    "onopentag"?: Function;
  };
}

//declare const OpenTagHandler<ATTR_NAMES_AND_TYPES> = (saxElement: SAXOpenTag<ATTR_NAMES_AND_TYPES>) => any;
declare type OpenTagHandler<ATTR_NAMES_AND_TYPES> = (
  saxElement: SAXOpenTag<ATTR_NAMES_AND_TYPES>
) => any;
declare type TextHandler<ATTR_NAMES_AND_TYPES> = (textNode: string) => any;
declare type CloseTagHandler<ATTR_NAMES_AND_TYPES> = (
  saxElement: string
) => any;
declare type ErrorHandler<ATTR_NAMES_AND_TYPES> = (err: Error) => void;
declare type SaxEventHandler<ATTR_NAMES_AND_TYPES> = OpenTagHandler<
  ATTR_NAMES_AND_TYPES
> &
  TextHandler<ATTR_NAMES_AND_TYPES> &
  CloseTagHandler<ATTR_NAMES_AND_TYPES> &
  ErrorHandler<ATTR_NAMES_AND_TYPES>;

declare class SAXStream<ATTR_NAMES_AND_TYPES> {
  writable: true;
  readable: true;
  value: any; // should be SAXStream
  constructor(strict: boolean, opt: Opt);
  createStream(
    strict: boolean,
    opt: Opt
  ): SAXStreamInstance<ATTR_NAMES_AND_TYPES>;
  end(chunk?): true;
  on(event: "opentag", handler: OpenTagHandler<ATTR_NAMES_AND_TYPES>): void;
  on(event: "text", handler: TextHandler<ATTR_NAMES_AND_TYPES>): void;
  on(event: "closetag", handler: CloseTagHandler<ATTR_NAMES_AND_TYPES>): void;
  on(event: "error", handler: ErrorHandler<ATTR_NAMES_AND_TYPES>): void;
  emit(eventName: SAXEVENTS, data?: any): any;
  // ... TODO add the rest of the events from sax.EVENTS
  write(data): true;
  close(): void;
}
