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

// Convert from GPML entity type to BioPAX entity reference type
var tmGpmlDataNodePrefixed2BiopaxEntityPlain = {
  'gpml:MetaboliteReference': 'SmallMoleculeReference',
  'gpml:Metabolite': 'SmallMolecule',
  'gpml:GeneProductReference': 'DnaReference',
  'gpml:GeneProduct': 'Dna',
  // TODO is this wrong? Biopax documentation says,
  // "A physical entity in BioPAX never represents a specific molecular instance."
  'gpml:Unknown': 'PhysicalEntity',
};

// Use Biopax terms when available, otherwise use GPML terms.
var tmEntityGpmlPlain2EntityNormalizedPrefixed = {
  'Complex': 'biopax:Complex',
  'GeneProduct': 'gpml:GeneProduct',
  'Metabolite': 'gpml:Metabolite',
  'Pathway': 'biopax:Pathway',
  'Protein': 'biopax:Protein',
  'Rna': 'biopax:Rna',
  'Unknown': 'gpml:Unknown',
  // Non-standard Types
  'GeneProdKegg enzymeuct': 'biopax:Protein',
  'SimplePhysicalEntity': 'biopax:PhysicalEntity',
  'Modifier':'gpml:Metabolite'
};

// Don't include the non-standard types
var tmEntityNormalized2EntityGpml =
    _.pairs(tmEntityGpmlPlain2EntityNormalizedPrefixed)
      .reduce(function(acc, item) {
        var key = item[0];
        var value = item[1];
        if (!acc.hasOwnProperty(key)) {
          acc[key] = value;
        }
        return acc;
      }, {});

// TODO this is repeated elsewhere in the pvjs
// codebase (maybe kaavio-editor). DRY it up.
var tmEntity2EntityReference = {
  'biopax:Complex': 'gpml:ComplexReference',
  'gpml:GeneProduct': 'gpml:GeneProductReference',
  'gpml:Metabolite': 'biopax:SmallMoleculeReference',
  'biopax:Pathway': 'gpml:PathwayReference',
  'biopax:Protein': 'biopax:ProteinReference',
  'biopax:Rna': 'biopax:RnaReference',
  'gpml:Unknown': 'gpml:UnknownReference',
  'gpml:State': 'biopax:SmallMoleculeReference'
};

function plainifyKeys(inputObject) {
  return _.pairs(inputObject)
  .reduce(function(acc, item) {
    var key = item[0].replace(/^.*:/, '');
    var value = item[1];
    acc[key] = value;
    return acc;
  }, {});
}

var tmEntityPlain2EntityReferencePrefixed = plainifyKeys(tmEntity2EntityReference);

var tmEntityReference2Entity = _.invert(tmEntity2EntityReference);

var tmEntityReferencePlain2Entity = plainifyKeys(tmEntityReference2Entity);

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
    var biopaxType = tmGpmlDataNodePrefixed2BiopaxEntityPlain[type];
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
  typeMappings: {
    gpmlDataNodePrefixed2biopaxEntityPlain: tmGpmlDataNodePrefixed2BiopaxEntityPlain,
    entityGpmlPlain2entityNormalizedPrefixed: tmEntityGpmlPlain2EntityNormalizedPrefixed,
    entityNormalized2entityGpml: tmEntityNormalized2EntityGpml,
    entity2entityReference: tmEntity2EntityReference,
    entityReference2entity: tmEntityReference2Entity
  },
  dereferenceElement: dereferenceElement,
  isType: isType,
  isBiopaxType: isBiopaxType
};
