public with sharing class XLP_POC_AccOppHierarchyTable {

    private static final Integer MAX_DEPTH = 5;

    @AuraEnabled(cacheable=true)
    public static List<Opportunity> getHierarchyOpportunities(
        Id accountId,
        String accountContextType,   // 'Broker' or 'Insured'
        String pipelineType,         // 'Pipeline' | 'Renewal' | 'Both'
        String newRenewalType,       // 'New' | 'Renewal' | 'Any'
        String stageName,            // e.g. 'Bound' or Any
        Boolean requireExpiryDate,   // true/false
        Boolean requireInceptionDate,   // true/false
        String sortField,
        String sortDirection
    ) {
        if (accountId == null) {
            return new List<Opportunity>();
        }

        try{
            // 1) Collect account hierarchy (this + descendants up to 5 levels)
            Set<Id> accountIds = collectDescendantAccounts(accountId, MAX_DEPTH);
            if (accountIds.isEmpty()) {
                return new List<Opportunity>();
            }

            // 2) Determine which lookup field to use on Opportunity
            //    Broker → XLP_BrokerName__c
            //    Insured → XLP_ClientName__c
            String accountField;
            if (accountContextType == 'Insured') {
                accountField = 'XLP_ClientName__c';
            } else {
                accountField = 'XLP_BrokerName__c';
            }

            // 3) Build SOQL dynamically 
            //    Whitelist sortField and sortDirection
            Set<String> allowedSortFields = new Set<String>{
                'XLP_InceptionDate__c',
                'XLP_ExpiryRenewalDate__c',
                'XLP_GrossPremiumAXAXLAmount__c'
            };

            String safeSortField = allowedSortFields.contains(sortField)
                ? sortField
                : 'CloseDate';

            String safeSortDirection = (sortDirection != null && sortDirection.toUpperCase() == 'DESC')
                ? 'DESC'
                : 'ASC';

            // 4) Base query
            String baseQuery =
                'SELECT Id, Name, StageName, Amount, CloseDate, ' +
                'XLP_ClientName__c, XLP_ClientName__r.Name, ' +
                'XLP_BrokerName__c, XLP_BrokerName__r.Name, ' +
                'XLP_InceptionDate__c, XLP_ExpiryRenewalDate__c, ' +
                'XLP_GrossPremiumAXAXLAmount__c, XLP_NewRenewal__c, RecordType.Name ' +
                'FROM Opportunity ' +
                'WHERE ' + accountField + ' IN :accountIds ';

            // 5) Add record type filters based on pipelineType
            List<String> recordTypeNames = new List<String>();

            if (pipelineType == 'Pipeline') {
                recordTypeNames.add('Opportunity Pipeline');
            } else if (pipelineType == 'Renewal') {
                recordTypeNames.add('Opportunity Pipeline Renewal');
            } else if (pipelineType == 'Both') {
                recordTypeNames.add('Opportunity Pipeline');
                recordTypeNames.add('Opportunity Pipeline Renewal');
            }

            if (!recordTypeNames.isEmpty()) {
                baseQuery += ' AND RecordType.Name IN :recordTypeNames ';
            }

            // 6) New / Renewal filter
            if (newRenewalType == 'New' || newRenewalType == 'Renewal') {
                baseQuery += ' AND XLP_NewRenewal__c = :newRenewalType ';
            }

            // 7) StageName filter (generic)
            if (stageName != null && stageName != 'Any') {
                baseQuery += ' AND StageName = :stageName ';
            }else if(stageName == 'Any'){
                baseQuery += ' AND StageName != null ';
            }

            // 8)a Expiry date filter
            if (requireExpiryDate) {
                Date todayValue = Date.today();
                baseQuery += ' AND XLP_ExpiryRenewalDate__c != NULL ' +
                            ' AND XLP_ExpiryRenewalDate__c >= :todayValue';
            }
            
            // 8)b Inception Date Filter
            if (requireInceptionDate) {
                Date todayValue = Date.today();
                baseQuery += ' AND XLP_InceptionDate__c != NULL ' +
                            ' AND XLP_InceptionDate__c >= :todayValue';
            }

            // 9) Sort
            baseQuery += ' ORDER BY ' + safeSortField + ' ' + safeSortDirection;

            // 10) Execute
            system.debug('@@@>>>baseQuery ' + baseQuery);
            system.debug('@@@>>>accountIds ' + accountIds);
            system.debug('@@@>>>accountField ' + accountField);
            system.debug('@@@>>>recordTypeNames ' + recordTypeNames);
            system.debug('@@@>>>newRenewalType ' + newRenewalType);
            system.debug('@@@>>>stageName ' + stageName);
            system.debug('@@@>>>todayValue ' + Date.today());
            //system.debug('@@@>>>requireInceptionDate ' + requireInceptionDate);
            //system.debug('@@@>>>requireExpiryDate ' + requireExpiryDate);
            system.debug('@@@>>>safeSortField ' + safeSortField);
            system.debug('@@@>>>safeSortDirection ' + safeSortDirection);
            List<Opportunity> opps = Database.query(baseQuery);
            system.debug('@@@>>>opps ' + opps);
            return opps;
              
        }catch (Exception e) {
             system.debug('@@>> ERROR '+ e); 
        }
        return new List<Opportunity>();
    }

    /**
     * Update opportunities from inline edit.
     */
    @AuraEnabled
    public static void updateOpportunities(List<Opportunity> opportunities) {
        if (opportunities == null || opportunities.isEmpty()) {
            return;
        }
        update opportunities;
    }

    /**
     * Collect descendant accounts up to maxDepth,
     * including the root.
     */
    private static Set<Id> collectDescendantAccounts(Id rootId, Integer maxDepth) {
        Set<Id> allIds = new Set<Id>();
        Set<Id> currentLevel = new Set<Id>{ rootId };

        Integer depth = 0;
        while (!currentLevel.isEmpty() && depth < maxDepth) {
            allIds.addAll(currentLevel);

            List<Account> children = [
                SELECT Id
                FROM Account
                WHERE ParentId IN :currentLevel
            ];

            currentLevel.clear();
            for (Account child : children) {
                if (!allIds.contains(child.Id)) {
                    currentLevel.add(child.Id);
                }
            }
            depth++;
        }
        return allIds;
    }
}
