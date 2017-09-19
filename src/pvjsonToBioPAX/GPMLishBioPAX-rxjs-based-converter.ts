import { SimpleElement } from "./extractable/rx-sax/rx-sax";
import * as He from "he";
import { reduce } from "lodash";
import { generatePublicationXrefId } from "./gpml-utilities";

import * as BIOPAX_TO_PVJSON from "./biopax-to-pvjson.json";
import * as VOCABULARY_NAME_TO_IRI from "./vocabulary-name-to-iri.json";

// NOTE: this is for handling the BioPAX as currently embedded in GPML.
// Such BioPAX is not currently conformant with the BioPAX 3 spec.
export function parseBioPAXElements(acc: any, el: SimpleElement) {
  const { tagName, children, attributes } = el;
  if (tagName === "bp:PublicationXref") {
    acc.PublicationXref.push(
      reduce(
        children,
        function(publicationXrefAcc, child) {
          const { tagName, textContent } = child;

          // using He.decode here, because some GPML at some point didn't use UTF-8
          // for things like author names.
          const textContentDecoded = He.decode(textContent);

          const key = BIOPAX_TO_PVJSON[tagName];
          if (
            ["dbId", "dbConventionalName", "title", "source", "year"].indexOf(
              key
            ) > -1
          ) {
            publicationXrefAcc[key] = textContentDecoded;
          } else {
            publicationXrefAcc[key].push(textContentDecoded);
          }
          return publicationXrefAcc;
        },
        {
          id: generatePublicationXrefId(el.attributes["rdf:id"]),
          displayName: String(acc.PublicationXref.length + 1),
          type: ["PublicationXref"],
          gpmlElementName: "BiopaxRef",
          author: []
        }
      ) as PublicationXref
    );
  } else if (tagName === "bp:openControlledVocabulary") {
    let openControlledVocabulary = reduce(
      children,
      function(openControlledOntologyAcc, child) {
        const { tagName, textContent } = child;

        // using He.decode here, because some GPML at some point didn't use UTF-8
        // for things like author names.
        const textContentDecoded = He.decode(textContent);

        const key = BIOPAX_TO_PVJSON.hasOwnProperty(tagName)
          ? BIOPAX_TO_PVJSON[tagName]
          : tagName.replace(/^bp:/, "").toLowerCase();
        openControlledOntologyAcc[key] = textContentDecoded;
        return openControlledOntologyAcc;
      },
      {
        type: ["OpenControlledVocabulary"]
      }
    ) as {
      id: string;
      term: string;
      dbId: string;
      ontology: string;
      type: string[];
    };

    const vocabularyName = openControlledVocabulary.ontology;
    let vocabularyIRI = VOCABULARY_NAME_TO_IRI[vocabularyName];
    if (!vocabularyIRI) {
      console.warn(
        `Unknown openControlledVocabulary name "${vocabularyName}" with dbId "${openControlledVocabulary.dbId}"`
      );
      vocabularyIRI = `http://www.ebi.ac.uk/miriam/main/search?query=${vocabularyName.replace(
        /\ /,
        "+"
      )}#`;
    }
    openControlledVocabulary.id = vocabularyIRI + openControlledVocabulary.dbId;
    acc.OpenControlledVocabulary.push(openControlledVocabulary);
  } else {
    console.warn(`Unknown BioPAX element: ${tagName}`);
  }
  return acc;
}
