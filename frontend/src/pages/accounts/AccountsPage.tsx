import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { accounts, keys } from '../../lib/queries'
import type { AccountListItem, AccountWrite } from '../../lib/types'
import { useDebounced } from '../../lib/useDebounced'
import { EMPTY } from '../../lib/format'
import type { Column } from '../../components/ui'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Pager,
  RowActions,
  Table,
  TextField,
  errorMessage,
  useToast,
} from '../../components/ui'
import { PageHeader } from '../../components/PageHeader'
import { AccountForm } from './AccountForm'

const LIMIT = 25

/**
 * Phase 1: the accounts table.
 *
 * This is the bootstrap screen rather than a CRM. `DealCreate` requires an
 * `account_id` and `DealStakeholderCreate` an existing `contact_id`, so until
 * this page existed the only way to mint either was psql -- which is why
 * phase 1 comes before the pipeline it feeds.
 */
export function AccountsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AccountListItem | null>(null)

  // `q` is `min_length=1` on the server, so a cleared box must send no `q` at
  // all -- `?q=` is a 422. `buildQuery` drops empty strings for exactly this.
  const q = useDebounced(search.trim()) || undefined
  const filters = { limit: LIMIT, offset, q }

  const list = useQuery({
    queryKey: keys.accounts(filters),
    queryFn: () => accounts.list(filters),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.accounts() })

  const create = useMutation({
    mutationFn: (body: AccountWrite) => accounts.create(body),
    onSuccess: async (account) => {
      await invalidate()
      setFormOpen(false)
      toast.success(`Created ${account.name}.`)
      // Straight into the detail page: the reason to create an account is
      // almost always to add a contact or a deal to it next.
      navigate(`/accounts/${account.id}`)
    },
  })

  const remove = useMutation({
    mutationFn: (accountId: string) => accounts.remove(accountId),
    onSuccess: async () => {
      await invalidate()
      setPendingDelete(null)
      toast.success('Account deleted.')
    },
    // No toast on failure: the 409 here is the interesting case and it stays
    // in the dialog, where the sentence about deleting deals first is next to
    // the button that was refused (1.5).
  })

  const columns: Column<AccountListItem>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => <strong style={{ color: 'var(--text-h)' }}>{row.name}</strong>,
    },
    { key: 'industry', header: 'Industry', render: (row) => row.industry || EMPTY },
    { key: 'hq_region', header: 'Region', render: (row) => row.hq_region || EMPTY },
    { key: 'deals', header: 'Deals', numeric: true, render: (row) => row.deal_count },
    {
      key: 'contacts',
      header: 'Contacts',
      numeric: true,
      render: (row) => row.contact_count,
    },
    {
      key: 'actions',
      header: <span className="ui-sr-only">Actions</span>,
      numeric: true,
      render: (row) => (
        <RowActions>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/accounts/${row.id}`)}>
            Open
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(row)}>
            Delete
          </Button>
        </RowActions>
      ),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Accounts"
        subtitle="The companies deals and contacts belong to."
        actions={
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            New account
          </Button>
        }
      />

      <Card flush>
        <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
          <TextField
            label="Search"
            type="search"
            value={search}
            placeholder="Account name"
            hint="Case-insensitive substring match on the name."
            onChange={(event) => {
              setSearch(event.target.value)
              // A narrower result set has fewer pages, so page 4 of the old
              // search is usually past the end of the new one.
              setOffset(0)
            }}
          />
        </div>

        {list.isPending ? (
          <LoadingBlock label="Loading accounts..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <>
            <Table
              columns={columns}
              rows={list.data.items}
              rowKey={(row) => row.id}
              onRowClick={(row) => navigate(`/accounts/${row.id}`)}
              empty={
                q ? (
                  <EmptyState
                    title="No matches"
                    body={`Nothing matches "${q}".`}
                    actions={
                      <Button size="sm" onClick={() => setSearch('')}>
                        Clear search
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    title="No accounts yet"
                    body="An account is the first thing this install needs: a deal requires one, and a stakeholder requires a contact that belongs to one."
                    actions={
                      <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>
                        Create the first account
                      </Button>
                    }
                  />
                )
              }
            />
            <Pager
              total={list.data.total}
              limit={list.data.limit}
              offset={list.data.offset}
              onOffsetChange={setOffset}
              busy={list.isFetching}
            />
          </>
        )}
      </Card>

      {/* Rendered only while open, so the form's state is fresh per open
          rather than reset in an effect. */}
      {formOpen && (
        <AccountForm
          busy={create.isPending}
          error={create.error}
          onSubmit={(body) => create.mutate(body)}
          onClose={() => {
            setFormOpen(false)
            create.reset()
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? 'account'}?`}
        busy={remove.isPending}
        // The 409 is not a bug to retry -- it is the backend refusing to
        // cascade, and the reason is in `detail`: deleting the account would
        // take its deals, their meetings, documents and every piece of
        // evidence behind them. Rendered as the sentence it is (1.5).
        error={remove.error ? errorMessage(remove.error) : undefined}
        body={
          pendingDelete && pendingDelete.deal_count > 0 ? (
            <>
              This account has <strong>{pendingDelete.deal_count}</strong> deal
              {pendingDelete.deal_count === 1 ? '' : 's'}, and the API will refuse to
              delete it. Delete those deals first -- one at a time, so the scale of what
              is being destroyed stays visible.
            </>
          ) : (
            <>
              This deletes the account and its {pendingDelete?.contact_count ?? 0} contact
              {pendingDelete?.contact_count === 1 ? '' : 's'}. It cannot be undone.
            </>
          )
        }
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => {
          setPendingDelete(null)
          remove.reset()
        }}
      />
    </div>
  )
}
