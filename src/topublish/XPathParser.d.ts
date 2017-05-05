declare type NullOrString = null | string;
declare function parse(string, opts?: any): NullOrString[][];

//declare function peg$SyntaxError(message, expected, found, location): void;
//declare function peg$SyntaxError(message, expected, found, location): void;
declare interface peg$SyntaxError {
	(message, expected, found, location): void;
	buildMessage: (expected, found) => string;
}
//import * as XPathParser from './XPathParser';
//import XPathParser = require('./XPathParser');
declare module 'XPathParser' {
	//export = parse;
	export const parse;
	export const SyntaxError: peg$SyntaxError;
}
