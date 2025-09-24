import { FormEvent, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button, Checkbox, CheckboxGroup } from 'react-aria-components'
import {
  CheckIcon,
  CopyIcon,
  Cross2Icon,
  PlusIcon,
  ReloadIcon,
  TrashIcon,
} from '@radix-ui/react-icons'
import { PanelDisclosure } from './PanelDisclosure'
import { queue } from '../ToastQueue'
import { useSidebarContext } from '../Sidebar/SidebarContext'
import { flushSync } from 'react-dom'

interface SavedPageMetadata {
  title: string
  url: string
  tokenCount: number
}

type SavedPages = SavedPageMetadata[]

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Something went wrong.'
}

export function WebDisclosurePanel() {
  const { directory, selectedPagesIds, setSelectedPagesIds } =
    useSidebarContext()
  const [savedPages, setSavedPages] = useState<SavedPages>([])
  const [isAddingNewPage, setIsAddingWeb] = useState(false)
  const [webUrl, setWebUrl] = useState('')
  const [isSavingWeb, setIsSavingWeb] = useState(false)
  const [reloadingUrls, setReloadingUrls] = useState<Set<string>>(
    () => new Set(),
  )
  const webUrlInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    async function loadSavedPages(selectedDirectoryPath: string) {
      try {
        const pages = await invoke<SavedPages>('list_saved_pages', {
          directoryPath: selectedDirectoryPath,
        })
        setSavedPages(pages)
        setSelectedPagesIds(() => new Set(pages.map((e) => e.url)))
      } catch (error) {
        const message = getErrorMessage(error)

        queue.add({
          title: 'Failed to load saved pages',
          description: message,
        })
      }
    }

    if (!directory?.path) {
      setSavedPages([])
      setSelectedPagesIds(() => new Set())
      return
    }

    void loadSavedPages(directory.path)
  }, [directory?.path])

  function showAddNewPageForm() {
    flushSync(() => {
      setWebUrl('')
      setIsAddingWeb(true)
    })

    webUrlInputRef.current?.focus()
  }

  function handleCancelWeb() {
    if (isSavingWeb) return

    setIsAddingWeb(false)
    setWebUrl('')
  }

  async function handleAddNewPage(event?: FormEvent<HTMLFormElement>) {
    if (event) {
      event.preventDefault()
    }

    const trimmedUrl = webUrl.trim()
    if (!trimmedUrl || isSavingWeb) return

    setIsSavingWeb(true)

    try {
      if (!directory?.path) {
        queue.add({
          title: 'No directory selected',
          description: 'Select a directory before saving pages.',
        })
        return
      }

      await invoke<SavedPageMetadata>('save_page_as_md', {
        directoryPath: directory.path,
        url: trimmedUrl,
      })

      const pages = await invoke<SavedPages>('list_saved_pages', {
        directoryPath: directory.path,
      })

      setSavedPages(pages)
      setSelectedPagesIds(() => new Set(pages.map((e) => e.url)))
      setWebUrl('')
      setIsAddingWeb(false)
    } catch (error) {
      const message = getErrorMessage(error)

      queue.add({
        title: 'Failed to add URL',
        description: message,
      })
    } finally {
      setIsSavingWeb(false)
    }
  }

  async function handleReload(entry: SavedPageMetadata) {
    if (!directory || reloadingUrls.has(entry.url)) return

    setReloadingUrls((prev) => {
      const next = new Set(prev)
      next.add(entry.url)
      return next
    })

    try {
      await invoke<SavedPageMetadata>('save_page_as_md', {
        directoryPath: directory.path,
        url: entry.url,
      })

      const pages = await invoke<SavedPages>('list_saved_pages', {
        directoryPath: directory.path,
      })

      setSavedPages(pages)
      setSelectedPagesIds((prev) => {
        const next = new Set<string>()
        for (const url of prev) {
          if (pages.some((p) => p.url === url)) {
            next.add(url)
          }
        }
        return next
      })
    } catch (error) {
      const message = getErrorMessage(error)

      queue.add({
        title: 'Failed to reload page',
        description: message,
      })
    } finally {
      setReloadingUrls((prev) => {
        const next = new Set(prev)
        next.delete(entry.url)
        return next
      })
    }
  }

  async function handleDelete(entry: SavedPageMetadata) {
    // TODO: Show a confirmation dialog before deleting
    if (!directory) return

    try {
      await invoke<void>('delete_saved_page', {
        directoryPath: directory.path,
        url: entry.url,
      })

      const pages = await invoke<SavedPages>('list_saved_pages', {
        directoryPath: directory.path,
      })

      setSavedPages(pages)
      setSelectedPagesIds((prev) => {
        const next = new Set(prev)
        next.delete(entry.url)
        return next
      })
    } catch (error) {
      const message = getErrorMessage(error)

      queue.add({
        title: 'Failed to delete page',
        description: message,
      })
    }
  }

  async function handleCopyToClipboard(entry: SavedPageMetadata) {
    if (!directory?.path) return

    try {
      await invoke<void>('copy_page_to_clipboard', {
        directoryPath: directory.path,
        url: entry.url,
      })

      queue.add({
        title: 'Page copied to clipboard',
      })
    } catch (error) {
      const message = getErrorMessage(error)

      queue.add({
        title: 'Failed to copy page',
        description: message,
      })
    }
  }

  async function handleCopySelectedToClipboard() {
    if (!directory?.path) return

    try {
      await invoke<void>('copy_all_pages_to_clipboard', {
        directoryPath: directory.path,
        urls: Array.from(selectedPagesIds),
      })

      queue.add({
        title: 'Page selected pages to clipboard',
      })
    } catch (error) {
      const message = getErrorMessage(error)

      queue.add({
        title: 'Failed to copy page',
        description: message,
      })
    }
  }

  function selectAll() {
    setSelectedPagesIds(() => new Set(savedPages.map((e) => e.url)))
  }

  function deselectAll() {
    setSelectedPagesIds(() => new Set())
  }

  const isGroupSelected =
    savedPages.length > 0 && selectedPagesIds.size === savedPages.length
  const isGroupIndeterminate =
    selectedPagesIds.size > 0 && selectedPagesIds.size < savedPages.length

  return (
    <PanelDisclosure
      id="web"
      label="Web"
      count={savedPages.length}
      panelClassName="p-2 flex flex-col gap-1"
      isGroupSelected={isGroupSelected}
      isGroupIndeterminate={isGroupIndeterminate}
      onSelectAll={selectAll}
      onDeselectAll={deselectAll}
      tokenCount={savedPages
        .filter((page) => selectedPagesIds.has(page.url))
        .reduce((acc, page) => acc + page.tokenCount, 0)}
      actions={
        <>
          {!isAddingNewPage && (
            <Button
              type="button"
              onPress={showAddNewPageForm}
              className="text-text-dark/75 hover:text-text-dark data-[disabled]:text-text-dark/75"
            >
              <PlusIcon />
            </Button>
          )}
          <Button
            onPress={() => {
              void handleCopySelectedToClipboard()
            }}
            className="text-text-dark/75 hover:text-text-dark data-[disabled]:text-text-dark/75"
          >
            <CopyIcon />
          </Button>
        </>
      }
    >
      {savedPages.length > 0 ? (
        <CheckboxGroup
          aria-label="Saved pages"
          value={Array.from(selectedPagesIds)}
          onChange={(values) => setSelectedPagesIds(new Set(values))}
        >
          <ul className="text-sm ">
            {savedPages.map((entry) => {
              const isReloading = reloadingUrls.has(entry.url)

              return (
                <li
                  key={`${entry.url}`}
                  className={`${isReloading ? 'opacity-75 pointer-events-none' : 'opacity-100'}`}
                >
                  <Checkbox
                    value={entry.url}
                    isDisabled={isReloading}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 gap-y-1 group text-left w-full rounded-sm px-2 py-0.5
                            hover:bg-accent-interactive-dark
                            data-[hovered]:bg-accent-interactive-dark
                            data-[disabled]:opacity-75
                            data-[disabled]:hover:bg-transparent"
                    slot="selection"
                  >
                    {({ isSelected }) => (
                      <>
                        <span
                          className="flex items-center justify-center size-[15px] rounded-sm text-accent-text-light
                                  border border-border-light  group-data-[selected]:border-accent-border-mid group-data-[indeterminate]:border-accent-border-mid
                                  bg-transparent group-data-[selected]:bg-accent-interactive-light group-data-[indeterminate]:bg-accent-interactive-light
                                  flex-shrink-0"
                        >
                          {isSelected && <CheckIcon />}
                        </span>
                        <span className="flex items-center gap-1.5 w-full">
                          <span className="font-normal shrink-0 text-text-dark break-all">
                            {entry.title}
                          </span>
                          <span className="hidden group-hover:inline text-solid-light truncate">
                            {entry.url}
                          </span>
                        </span>
                        <span>
                          <span className="hidden group-hover:flex group-hover:items-center group-hover:gap-1.5">
                            <Button
                              onPress={() => {
                                void handleCopyToClipboard(entry)
                              }}
                              className="text-text-light/75 hover:text-text-light data-[disabled]:text-text-light/75"
                              isDisabled={isReloading}
                            >
                              <CopyIcon />
                            </Button>
                            <Button
                              onPress={() => {
                                void handleReload(entry)
                              }}
                              className="text-text-light/75 hover:text-text-light data-[disabled]:text-text-light/75"
                              isDisabled={isReloading}
                            >
                              <ReloadIcon />
                            </Button>
                            <Button
                              onPress={() => {
                                void handleDelete(entry)
                              }}
                              className=" text-red/75 hover:text-red data-[disabled]:text-red/75"
                              isDisabled={isReloading}
                            >
                              <TrashIcon />
                            </Button>
                          </span>
                        </span>
                        <span className="text-solid-light text-xs border border-border-dark px-1 rounded-sm uppercase group-hover:text-text-dark group-hover:border-border-light">
                          {entry.tokenCount?.toLocaleString() ?? '–'}
                        </span>
                      </>
                    )}
                  </Checkbox>
                </li>
              )
            })}
          </ul>
        </CheckboxGroup>
      ) : !isAddingNewPage ? (
        <div className="text-xs text-solid-light">
          Web pages you add here will be formatted as markdown and included with
          your prompt.
        </div>
      ) : null}

      {isAddingNewPage && (
        <form
          onSubmit={(event) => {
            void handleAddNewPage(event)
          }}
        >
          <div className="group flex ml-8.5 mr-2 mt-1 mb-2">
            <input
              id="web-url"
              type="url"
              placeholder="Enter a full URL"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              ref={webUrlInputRef}
              value={webUrl}
              onChange={(event) => setWebUrl(event.target.value)}
              disabled={isSavingWeb}
              className="block w-full -mr-px rounded-l-sm bg-background-dark py-0.75 px-2 text-text-dark outline-1 -outline-offset-1 outline-interactive-light placeholder:text-solid-light focus:outline-1 focus:-outline-offset-1 focus:outline-accent-interactive-light text-sm"
            />
            <div className="rounded-r-sm flex outline-1 -outline-offset-1  outline-interactive-light group-has-focus:outline-accent-interactive-light">
              <Button
                type="submit"
                isDisabled={isSavingWeb || !webUrl.trim()}
                className="px-3 bg-accent-interactive-mid hover:bg-accent-interactive-light text-accent-text-light data-[disabled]:bg-interactive-mid data-[disabled]:text-text-dark"
              >
                <CheckIcon aria-hidden="true" />
              </Button>
              <Button
                type="button"
                onPress={handleCancelWeb}
                isDisabled={isSavingWeb}
                className="px-3 text-text-dark hover:bg-accent-background-light"
              >
                <Cross2Icon aria-hidden="true" />
              </Button>
            </div>
          </div>
        </form>
      )}
    </PanelDisclosure>
  )
}
