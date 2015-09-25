var _ = require('lodash');

var biopaxPhysicalEntityTypes = [
  'Protein',
  'Dna',
  'Rna',
  'SmallMolecule',
  'Gene',
  'PhysicalEntity',
  'Complex'
];

var biopaxNodeTypes = biopaxPhysicalEntityTypes.concat([
  'PublicationXref',
  'UnificationXref',
  'RelationshipXref',
  'ProteinReference',
  'DnaReference',
  'RnaReference',
  'SmallMoleculeReference',
  'Pathway'
]);

var biopaxEdgeTypes = [
  'Interaction',
  'Control',
  'TemplateReactionRegulation',
  'Catalysis',
  'Modulation',
  'Conversion',
  'BiochemicalReaction',
  'TransportWithBiochemicalReaction',
  'ComplexAssembly',
  'Degradation',
  'Transport',
  'TransportWithBiochemicalReaction',
  'GeneticInteraction',
  'MolecularInteraction',
  'TemplateReaction'
];

var biopaxTypes = biopaxNodeTypes.concat(biopaxEdgeTypes);

// Convert from GPML to BioPAX types
var gpmlDataNodeTypeToBiopaxEntityTypeMappings = {
  'gpml:MetaboliteReference': 'SmallMoleculeReference',
  'gpml:Metabolite': 'SmallMolecule',
  'gpml:GeneProductReference': 'DnaReference',
  'gpml:GeneProduct': 'Dna',
  // TODO is this wrong? Biopax documentation says,
  // "A physical entity in BioPAX never represents a specific molecular instance."
  'gpml:Unknown': 'PhysicalEntity',
};

function dereferenceElement(elements, id) {
  return _.find(elements, function(element) {
    return element.id === id;
  });
}

function isType(referenceTypeList, type) {
  type = _.isArray(type) ? type : [type];
  return !_.isEmpty(_.intersection(referenceTypeList, type));
}

function isBiopaxType(referenceTypeList, oneTypeOrList) {
  var typeList = _.isArray(oneTypeOrList) ? oneTypeOrList : [oneTypeOrList];
  typeList = typeList.reduce(function(accumulator, type) {
    accumulator.push(type);
    var biopaxType = gpmlDataNodeTypeToBiopaxEntityTypeMappings[type];
    accumulator.push(biopaxType);
    return accumulator;
  }, []);
  return !_.isEmpty(_.intersection(referenceTypeList, typeList));
}

module.exports = {
  biopax: {
    nodeTypes: biopaxNodeTypes,
    edgeTypes: biopaxEdgeTypes,
    physicalEntityTypes: biopaxPhysicalEntityTypes,
    allTypes: biopaxTypes
  },
  dereferenceElement: dereferenceElement,
  gpmlDataNodeTypeToBiopaxEntityTypeMappings:
      gpmlDataNodeTypeToBiopaxEntityTypeMappings,
  isType: isType,
  isBiopaxType: isBiopaxType
};
