/// <reference path="./gpml2pvjson.d.ts" />
/// <reference path="./json.d.ts" />
// TODO we're not using this file anymore for GPML to pvjson conversion because it's too much,
// but we should use this for pvjson to BioPAX conversion.
import { isArray, omit } from "lodash/fp";
import { intersectsLSV, unionLSV } from "./gpml-utilities";
import * as PvjsonToBioPAX from "./PvjsonToBioPAX.json";
import * as ArrowHeadMappings from "./ArrowHeadMappings.json";

// TODO this used to be in the group.ts. What was it used for?
const biopaxEdgeTypes = [
  "Interaction",
  "Control",
  "TemplateReactionRegulation",
  "Catalysis",
  "Modulation",
  "Conversion",
  "BiochemicalReaction",
  "TransportWithBiochemicalReaction",
  "ComplexAssembly",
  "Degradation",
  "Transport",
  "TransportWithBiochemicalReaction",
  "GeneticInteraction",
  "MolecularInteraction",
  "TemplateReaction"
];

const biopaxPhysicalEntityTypes = [
  "Protein",
  "Dna",
  "Rna",
  "SmallMolecule",
  "Gene",
  "PhysicalEntity",
  "Complex"
];

const biopaxNodeTypes = biopaxPhysicalEntityTypes.concat([
  "PublicationXref",
  "UnificationXref",
  "RelationshipXref",
  "ProteinReference",
  "DnaReference",
  "RnaReference",
  "SmallMoleculeReference",
  "Pathway"
]);

function convertConversionToGenericInteraction(
  conversion: Controlled
): PvjsonInteraction {
  console.warn("This Conversion fails BioPAX validator:");
  console.warn(conversion);
  const interaction = omit(conversion, [
    "left",
    "right",
    "conversionDirection",
    "sboInteractionType",
    "wpInteractionType"
  ]);
  interaction.type = ["Interaction"];
  interaction.participants = [conversion.left, conversion.right];
  return interaction;
}

function convertCatalysisToGenericInteraction(
  catalysis: Control
): PvjsonInteraction {
  console.warn("This Catalysis fails BioPAX validator:");
  console.warn(catalysis);

  const interaction = omit(catalysis, [
    "controlled",
    "constroller",
    "interactionType"
  ]);
  interaction.type = ["Interaction"];
  interaction.participants = [catalysis.controlled, catalysis.controller];
  return interaction;
}

/*
function isConversion(interaction: PvjsonEdge | PvjsonInteraction | Control): interaction is Controlled {
}
//*/

function isCatalysis(
  interaction: PvjsonEdge | PvjsonInteraction | Control
): interaction is Control {
  return intersectsLSV(interaction.type, "Catalysis");
}

export function postprocessPVJSON(
  referencedEntities: { [key: string]: PvjsonEntity },
  interaction: PvjsonEdge
): PvjsonInteraction {
  let targetId;
  let sourceId;
  let marker;

  const points = interaction.points;

  if (interaction.markerStart) {
    marker = interaction.markerStart;
    // sometimes the graphical terminology (startMarker, endMarker) won't line up
    // with the graph terminology.
    sourceId = points[points.length - 1].isAttachedTo;
    targetId = points[0].isAttachedTo;
  } else if (interaction.markerEnd) {
    marker = interaction.markerEnd;
    sourceId = points[0].isAttachedTo;
    targetId = points[points.length - 1].isAttachedTo;
  } else {
    marker = "none";
    sourceId = points[0].isAttachedTo;
    targetId = points[points.length - 1].isAttachedTo;
  }

  if (!sourceId || !targetId) {
    console.warn("Unconnected Interaction(s) present in this pathway.");
    return <PvjsonInteraction>interaction;
  }

  const sourceNode = referencedEntities[sourceId];
  const targetNode = referencedEntities[targetId];

  if (marker === "Arrow") {
    const sourceIsEdge = sourceNode.hasOwnProperty("points");
    const targetIsEdge = targetNode.hasOwnProperty("points");
    const sourceIsBiopaxPhysicalEntity = intersectsLSV(
      biopaxPhysicalEntityTypes,
      sourceNode.type.map(t => PvjsonToBioPAX[t]).filter(t => !!t)
    );
    const targetIsBiopaxPhysicalEntity = intersectsLSV(
      biopaxPhysicalEntityTypes,
      targetNode.type.map(t => PvjsonToBioPAX[t]).filter(t => !!t)
    );
    const sourceIsBiopaxPhysicalEntityOrPathway =
      sourceIsBiopaxPhysicalEntity || intersectsLSV("Pathway", sourceNode.type);
    const targetIsBiopaxPhysicalEntityOrPathway =
      targetIsBiopaxPhysicalEntity || intersectsLSV("Pathway", targetNode.type);
    //*
    if (sourceIsBiopaxPhysicalEntity && targetIsBiopaxPhysicalEntity) {
      // TODO is this a safe assumption? The resulting JSON will have a BioPAX
      // type of Conversion, which is a superclass for the closest BioPAX terms
      // to mim-cleavage and mim-binding.
      // The plain arrow could also theoretically represent mim-transcription-translation,
      // but our pathways use DataNodes of type GeneProduct to cover that. They don't
      // usually indicate Gene -> RNA -> Protein
      marker = "mim-conversion";
      //*/
    } else if (
      (sourceIsEdge && targetIsBiopaxPhysicalEntityOrPathway) ||
      (sourceIsBiopaxPhysicalEntityOrPathway && targetIsEdge)
    ) {
      // TODO is this a safe assumption? It's unreasonable for it to be an inhibition.
      // If it's actually supposed to be a mim-catalysis or mim-necessary-stimulation
      // instead of a mim-stimulation, the resulting JSON will still not be exactly wrong,
      // because both mim-stimulation and mim-necessary-stimulation are mapped to
      // a BioPAX Control w/ controlType ACTIVATION, and Control is a superclass
      // of Catalysis.
      marker = "mim-stimulation";
    }
  }

  const identifierMappings = ArrowHeadMappings[marker];
  let biopaxType: string;
  if (!!identifierMappings) {
    const biopaxMappings = identifierMappings.biopax;
    if (!!biopaxMappings && !!biopaxMappings.name) {
      biopaxType = interaction.biopaxType = biopaxMappings.name;
      const biopaxControlType: string = biopaxMappings.controlType;
      if (biopaxControlType) {
        interaction.controlType = biopaxControlType;
      }
    }
    const wpInteractionType = identifierMappings.wp;
    if (!!wpInteractionType) {
      interaction.wpInteractionType = wpInteractionType;
    }
    const sboInteractionType = identifierMappings.sbo;
    if (!!sboInteractionType) {
      interaction.sboInteractionType = sboInteractionType;
    }
    interaction.type = unionLSV(
      interaction.type,
      biopaxType,
      wpInteractionType,
      sboInteractionType
    ) as string[];
  }

  /* this below is an attempt to model interactions using named graphs
	interaction.relationGraph = [{
		id: sourceId,
		relation: targetId
	}];
	//*/

  // and this is an attempt to model interactions using Biopax
  // TODO still need to consider things like CovalentBindingFeature, etc.
  if (intersectsLSV(["Interaction", "MolecularInteraction"], biopaxType)) {
    interaction.participants = [];
    interaction.participants.push(sourceId);
    interaction.participants.push(targetId);
  } else if (intersectsLSV(["Control", "Catalysis"], biopaxType)) {
    if (!!identifierMappings && !!identifierMappings.controlType) {
      interaction.controlType = identifierMappings.controlType;
    }
    interaction.controller = sourceId;
    interaction.controlled = targetId;
  } else if (
    intersectsLSV(
      ["Conversion", "BiochemicalReaction", "Degradation"],
      biopaxType
    )
  ) {
    // TODO this isn't actually checking the other marker to
    // make sure it also indicates conversion
    if (!!interaction.markerStart && !!interaction.markerEnd) {
      interaction.conversionDirection = "REVERSIBLE";
    } else {
      interaction.conversionDirection = "LEFT-TO-RIGHT";
    }
    interaction.left = sourceId;
    interaction.right = targetId;
  } else {
    interaction.participants = [];
    interaction.participants.push(sourceId);
    interaction.participants.push(targetId);
  }

  /*
	if (marker === 'mim-binding' || marker === 'mim-covalent-bond') {
		// TODO something with entityFeature, BindingFeature, CovalentBindingFeature, bindsTo...
	}
	//*/

  if (isCatalysis(interaction)) {
    const controlled = referencedEntities[interaction.controlled] as Controlled;
    const controller: PvjsonEntity = referencedEntities[interaction.controller];

    const controllerTypeBioPAX = controller.type
      .map(t => PvjsonToBioPAX[t])
      .filter(t => !!t);
    if (!intersectsLSV(biopaxNodeTypes, controllerTypeBioPAX)) {
      // If the controller is not a Pathway or a
      // PhysicalEntity (Metabolite, Complex, etc.),
      // we make this interaction generic, because it's not a valid
      // Catalysis.
      convertCatalysisToGenericInteraction(interaction);
    }

    // If it's still a Catalysis but controlled is just a generic Interaction,
    // we need to convert controlled to be a Conversion.
    if (
      intersectsLSV("Catalysis", interaction.type) &&
      intersectsLSV("Interaction", controlled.type)
    ) {
      controlled.type = unionLSV(controlled.type, "Conversion") as string[];
      const participants = controlled.participants;
      if (isArray(participants) && participants.length >= 2) {
        controlled.left = participants[0];
        controlled.right = participants[1];
        delete controlled.participants;
      } else {
        convertConversionToGenericInteraction(controlled);
        convertCatalysisToGenericInteraction(interaction);
      }
    }
  }

  // TODO use immutable techniques to avoid having to define this here
  return <PvjsonInteraction>interaction;
}
