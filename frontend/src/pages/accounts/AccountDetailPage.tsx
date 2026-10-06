import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { accounts, contacts, keys } from '../../lib/queries'
import type { AccountWrite, Contact, ContactWrite } from '../../lib/types'
import { EMPTY } from '../../lib/format'
import type { Column } from '../../components/ui'
import {
  Button,
  Card,
  ConfirmDialog,
  Definition,
  Definitions,
  EmptyState,
  ErrorState,
  LoadingBlock,
  RowActions,
  Table,
  errorMessage,
  useToast,
} from '../../components/ui'
import { PageHeader } from '../../components/PageHeader'
import { AccountForm } from './AccountForm'
import { ContactForm } from './ContactForm'

/**
 * Phase 1: one account's fields above its contact list (tasks 1.3, 1.4, 1.6).
 */
export function AccountDetailPage() {
  const { accountId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [editing, setEditing] = useState(false)
  const [contactForm, setContactForm] = useState<{ open: boolean; contact?: Contact }>({
    open: false,
  })
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null)

  const account = useQuery({
    queryKey: keys.account(accountId),
    queryFn: () => accounts.get(accountId),
  })

  const contactList = useQuery({
    queryKey: keys.contacts(accountId),
    // A bare array, not a `Page` -- this endpoint is unpaginated because it
    // is the picker behind "add a stakeholder" (conventions #1).
    queryFn: () => contacts.list(accountId),
  })

  /**
   * Both the account query and the accounts *list* are invalidated.
   *
   * The list carries `contact_count` as a SQL subquery, so adding a contact
   * here changes a number on a page this one navigated from -- and the
   * `['accounts']` prefix catches both, which is the point of the key
   * convention.
   */
  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.accounts() }),
      queryClient.invalidateQueries({ queryKey: keys.account(accountId) }),
    ])

  const updateAccount = useMutation({
    mutationFn: (body: Partial<AccountWrite>) => accounts.update(accountId, body),
    onSuccess: async () => {
      await invalidateAll()
      setEditing(false)
      toast.success('Account updated.')
    },
  })

  const saveContact = useMutation({
    mutationFn: (body: ContactWrite) =>
      contactForm.contact
        ? contacts.update(accountId, contactForm.contact.id, body)
        : contacts.create(accountId, body),
    onSuccess: async () => {
      await invalidateAll()
      setContactForm({ open: false })
      toast.success(contactForm.contact ? 'Contact updated.' : 'Contact added.')
    },
  })

  const removeContact = useMutation({
    mutationFn: (contactId: string) => contacts.remove(accountId, contactId),
    onSuccess: async () => {
      await invalidateAll()
      setPendingDelete(null)
      toast.success('Contact removed.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (account.isPending) {
    return (
      <div className="page">
        <LoadingBlock label="Loading account..." />
      </div>
    )
  }

  if (account.isError) {
    return (
      <div className="page">
        <PageHeader title="Account" />
        <Card>
          <ErrorState
            error={account.error}
            onRetry={account.refetch}
            title="This account could not be loaded"
          />
          <div className="ui-empty__actions" style={{ justifyContent: 'center' }}>
            <Button onClick={() => navigate('/accounts')}>Back to accounts</Button>
          </div>
        </Card>
      </div>
    )
  }

  const data = account.data

  const columns: Column<Contact>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        // The anchor target the duplicate-email 409 link points at (1.5).
        <span id={`contact-${row.id}`} style={{ color: 'var(--text-h)' }}>
          {row.first_name} {row.last_name}
        </span>
      ),
    },
    { key: 'title', header: 'Title', render: (row) => row.title || EMPTY },
    {
      key: 'email',
      header: 'Email',
      render: (row) =>
        row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : EMPTY,
    },
    { key: 'phone', header: 'Phone', render: (row) => row.phone || EMPTY },
    {
      key: 'actions',
      header: <span className="ui-sr-only">Actions</span>,
      numeric: true,
      render: (row) => (
        <RowActions>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setContactForm({ open: true, contact: row })}
          >
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(row)}>
            Remove
          </Button>
        </RowActions>
      ),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title={data.name}
        subtitle={<Link to="/accounts">&larr; All accounts</Link>}
        actions={<Button onClick={() => setEditing(true)}>Edit account</Button>}
      />

      <Card title="Details">
        <Definitions>
          <Definition label="Industry">{data.industry || EMPTY}</Definition>
          <Definition label="HQ region">{data.hq_region || EMPTY}</Definition>
          <Definition label="Employees">{data.employee_band || EMPTY}</Definition>
          <Definition label="Website">
            {data.website ? (
              <a
                // The stored value may have no scheme, and a bare
                // `href="northwind.example"` resolves as a relative path
                // inside this app rather than as an external site.
                href={/^https?:\/\//i.test(data.website) ? data.website : `https://${data.website}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {data.website}
              </a>
            ) : (
              EMPTY
            )}
          </Definition>
        </Definitions>
      </Card>

      <Card
        title="Contacts"
        description="People at this company. A deal stakeholder must be one of these."
        actions={
          <Button variant="primary" size="sm" onClick={() => setContactForm({ open: true })}>
            Add contact
          </Button>
        }
        flush
      >
        {contactList.isPending ? (
          <LoadingBlock label="Loading contacts..." />
        ) : contactList.isError ? (
          <ErrorState error={contactList.error} onRetry={contactList.refetch} />
        ) : (
          <Table
            columns={columns}
            rows={contactList.data}
            rowKey={(row) => row.id}
            empty={
              <EmptyState
                title="No contacts yet"
                body="A deal stakeholder needs an existing contact, so this is where the economic buyer gets added before the meeting you need them in -- rather than after they have spoken on a recorded call."
                actions={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setContactForm({ open: true })}
                  >
                    Add the first contact
                  </Button>
                }
              />
            }
          />
        )}
      </Card>

      {editing && (
        <AccountForm
          account={data}
          busy={updateAccount.isPending}
          error={updateAccount.error}
          onSubmit={(body) => updateAccount.mutate(body)}
          onClose={() => {
            setEditing(false)
            updateAccount.reset()
          }}
        />
      )}

      {/* Keyed by contact id so switching straight from editing one person
          to another remounts with the right values -- "new" gets its own key
          so the blank form is not confused with an edit. */}
      {contactForm.open && (
        <ContactForm
          key={contactForm.contact?.id ?? 'new'}
          contact={contactForm.contact}
          busy={saveContact.isPending}
          error={saveContact.error}
          onSubmit={(body) => saveContact.mutate(body)}
          onClose={() => {
            setContactForm({ open: false })
            saveContact.reset()
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Remove ${pendingDelete?.first_name ?? ''} ${pendingDelete?.last_name ?? ''}?`}
        confirmLabel="Remove contact"
        busy={removeContact.isPending}
        // Task 1.6: say what this actually does, because the two referencing
        // tables behave differently and neither behaviour is guessable.
        body={
          <>
            <p>
              Their stakeholder links are deleted -- someone who is gone is not a
              stakeholder.
            </p>
            <p style={{ marginTop: 'var(--space-3)' }}>
              Their <strong>meeting attendee rows survive</strong>, with the contact link
              set back to empty. That is deliberate: the row records that a name spoke in
              a transcript, which stays true whether or not this person is still tracked.
              Those attendees return to the unresolved state, so they will reappear as
              untracked participants.
            </p>
          </>
        }
        onConfirm={() => pendingDelete && removeContact.mutate(pendingDelete.id)}
        onCancel={() => {
          setPendingDelete(null)
          removeContact.reset()
        }}
      />
    </div>
  )
}
