import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

import getHierarchyOpportunities from '@salesforce/apex/XLP_POC_AccHierarchyOppCtrl.getHierarchyOpportunities';
import updateOpportunities from '@salesforce/apex/XLP_POC_AccHierarchyOppCtrl.updateOpportunities';

const COLUMNS = [
    {
        label: 'Opportunity Name',
        fieldName: 'oppLink',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'Name' },
            target: '_blank'
        }
    },
    {
        label: 'Stage',
        fieldName: 'StageName',
        type: 'text',
        editable: true
    },
    {
        label: 'Amount',
        fieldName: 'Amount',
        type: 'currency',
        editable: true
    },
    {
        label: 'Close Date',
        fieldName: 'CloseDate',
        type: 'date',
        editable: true
    },
    {
        label: 'Account',
        fieldName: 'accountLink',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'AccountName' },
            target: '_blank'
        }
    }
];

export default class XLP_POC_AccountHierarchyOpportunities extends LightningElement {
    @api recordId; // Account Id from the record page

    columns = COLUMNS;

    @track tableData = [];
    @track draftValues = [];
    @track isLoading = false;

    wiredResult; // to use with refreshApex

    @wire(getHierarchyOpportunities, { accountId: '$recordId' })
    wiredOpportunities(result) {
        this.wiredResult = result;

        const { data, error } = result;
        if (data) {
            this.isLoading = false;
            this.tableData = data.map(opp => ({
                ...opp,
                oppLink: '/' + opp.Id,
                accountLink: opp.AccountId ? '/' + opp.AccountId : null,
                AccountName: opp.Account ? opp.Account.Name : null
            }));
        } else if (error) {
            this.isLoading = false;
            this.tableData = [];
            this.showToast('Error loading opportunities', this.reduceError(error), 'error');
        }
    }

    get hasData() {
        return this.tableData && this.tableData.length > 0;
    }

    async handleSave(event) {
        this.isLoading = true;

        const updatedFields = event.detail.draftValues;

        try {
            await updateOpportunities({ opportunities: updatedFields });

            this.showToast('Success', 'Opportunities updated', 'success');

            // Clear draft values and refresh data
            this.draftValues = [];
            await refreshApex(this.wiredResult);
        } catch (error) {
            this.showToast('Error updating opportunities', this.reduceError(error), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }

    // Helper to flatten error messages
    reduceError(error) {
        if (!error) {
            return 'Unknown error';
        }
        if (Array.isArray(error.body)) {
            return error.body.map(e => e.message).join(', ');
        } else if (error.body && typeof error.body.message === 'string') {
            return error.body.message;
        }
        return error.message || 'Unknown error';
    }
}
