# gpml2biopax

## Convert GPML to BioPAX

```
cd /Users/andersriutta/Sites/gpml2pvjson-js/test/
node gpml2biopaxrdfxml-streaming.js
```

## Validate generated BioPAX

View options for local validator:

```
java -jar biopax-validator.jar

```
View options for web-client validator.


```
java -jar biopax-validator-client.jar

```

1. Download paxtools version 4.2.2 from <http://sourceforge.net/projects/biopax/files/validator/>
2. Extract and put it into the /Applications directory
3. Download paxtools version 3.2.2 from <http://sourceforge.net/projects/biopax/files/validator/>,
   extract, get `spring-instrument-3.2.2.RELEASE.jar` from 3.2.2 lib directory and copy it over to
   the lib dir for 4.2.2.
4. Updated pointer to `spring-instrument` in validate.sh so that it references path of above file.
5. In terminal:
      ```
      export JAVA_HOME='java'
      cd /Applications/biopax-validator-4.0.0-SNAPSHOT/
      ```
6. First test that validator works with:
      ```
      sh ./validate-patched-local.sh ./sampleData/testAcyclicComplexRule.owl --profile=notstrict
      ```
7. Then run it for one of our files like this:
      ```
      sh /Applications/biopax-validator-4.0.0-SNAPSHOT/validate-patched-local.sh /Users/andersriutta/Sites/gpml2pvjson-js/test/WP525v78459.owl --profile=notstrict
      ```

You can alternately use the web client for small files:
    ```
    java -jar biopax-validator-client.jar /Users/andersriutta/Sites/gpml2pvjson-js/test/WP525v78459.owl /Users/andersriutta/Sites/gpml2pvjson-js/test/WP52
    5v78459-report.xml xml notstrict only-errors
    ```
