import _ = require('lodash');
import * as GpmlUtilities from './gpml-utilities';

export let defaults = {
	attributes: {
		BoardHeight: {
			name: 'BoardHeight',
			value: 500
		},
		Name: {
			name: 'Name',
			value: 'Untitled Pathway'
		}
	}
};

export function applyDefaults(gpmlElement, defaults) {
	GpmlUtilities.applyDefaults(gpmlElement, [this.defaults, defaults]);
	return gpmlElement;
};
