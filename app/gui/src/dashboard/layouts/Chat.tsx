/** @file A WebSocket-based chat directly to official support on the official Discord server. */
import * as React from 'react'

import * as reactDom from 'react-dom'

import * as chat from '#/services/Chat'

import CloseLargeIcon from '#/assets/close_large.svg'
import DefaultUserIcon from '#/assets/default_user.svg'
import FolderArrowIcon from '#/assets/folder_arrow.svg'

import * as gtagHooks from '#/hooks/gtagHooks'
import * as toastAndLogHooks from '#/hooks/toastAndLogHooks'

import * as authProvider from '#/providers/AuthProvider'
import * as loggerProvider from '#/providers/LoggerProvider'
import * as textProvider from '#/providers/TextProvider'

import * as aria from '#/components/aria'
import * as ariaComponents from '#/components/AriaComponents'
import SvgMask from '#/components/SvgMask'
import Twemoji from '#/components/Twemoji'

import { useSyncRef } from '#/hooks/syncRefHooks'
import * as dateTime from '#/utilities/dateTime'
import * as newtype from '#/utilities/newtype'
import * as object from '#/utilities/object'
import * as tailwindMerge from '#/utilities/tailwindMerge'

// ================
// === Newtypes ===
// ================

/** Create a {@link chat.MessageId}. */
const MessageId = newtype.newtypeConstructor<chat.MessageId>()

// =================
// === Constants ===
// =================

// TODO[sb]: Consider associating a project with a thread
// (and providing a button to jump to the relevant project).
// The project shouldn't be jumped to automatically, since it may take a long time
// to switch projects, and undo history may be lost.

export const HELP_CHAT_ID = 'enso-chat'
/** The size (both width and height) of each reaction button. */
const REACTION_BUTTON_SIZE = 20
/** The size (both width and height) of each reaction on a message. */
const REACTION_SIZE = 16
/** The list of reaction emojis, in order. */
const REACTION_EMOJIS: chat.ReactionSymbol[] = ['❤️', '👍', '👎', '😀', '🙁', '👀', '🎉']
/** The initial title of the thread. */
const DEFAULT_THREAD_TITLE = 'New chat thread'
/** A {@link RegExp} matching any non-whitespace character. */
const NON_WHITESPACE_CHARACTER_REGEX = /\S/
/** A {@link RegExp} matching auto-generated thread names. */
const AUTOGENERATED_THREAD_TITLE_REGEX = /^New chat thread (\d+)$/
/** The maximum number of lines to show in the message input, past which a scrollbar is shown. */
const MAX_MESSAGE_INPUT_LINES = 10
/**
 * The maximum number of messages to fetch when opening a new thread.
 * This SHOULD be the same limit as the chat backend (the maximum number of messages sent in
 * `serverThread` events).
 */
const MAX_MESSAGE_HISTORY = 25

// ==========================
// === ChatDisplayMessage ===
// ==========================

/** Information needed to display a chat message. */
interface ChatDisplayMessage {
  readonly id: chat.MessageId
  /**
   * If `true`, this is a message from the staff to the user.
   * If `false`, this is a message from the user to the staff.
   */
  readonly isStaffMessage: boolean
  readonly avatar: string | null
  /** Name of the author of the message. */
  readonly name: string
  readonly content: string
  readonly reactions: chat.ReactionSymbol[]
  /** Given in milliseconds since the unix epoch. */
  readonly timestamp: number
  /** Given in milliseconds since the unix epoch. */
  readonly editedTimestamp: number | null
}

// ==========================
// === makeNewThreadTitle ===
// ==========================

/** Returns an auto-generated thread title. */
function makeNewThreadTitle(threads: chat.ThreadData[]) {
  const threadTitleNumbers = threads
    .map((thread) => thread.title.match(AUTOGENERATED_THREAD_TITLE_REGEX))
    .flatMap((match) => (match != null ? parseInt(match[1] ?? '0', 10) : []))
  return `${DEFAULT_THREAD_TITLE} ${Math.max(0, ...threadTitleNumbers) + 1}`
}

// ===================
// === ReactionBar ===
// ===================

/** Props for a {@link ReactionBar}. */
export interface ReactionBarProps {
  readonly selectedReactions: Set<chat.ReactionSymbol>
  readonly doReact: (reaction: chat.ReactionSymbol) => void
  readonly doRemoveReaction: (reaction: chat.ReactionSymbol) => void
  readonly className?: string
}

/** A list of emoji reactions to choose from. */
function ReactionBar(props: ReactionBarProps) {
  const { selectedReactions, doReact, doRemoveReaction, className } = props

  return (
    <div
      className={tailwindMerge.twMerge(
        'm-chat-reaction-bar inline-block rounded-full bg-frame',
        className,
      )}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <ariaComponents.Button
          size="custom"
          variant="custom"
          key={emoji}
          isActive={selectedReactions.has(emoji)}
          className={tailwindMerge.twMerge(
            'm-chat-reaction rounded-full p-chat-reaction hover:bg-hover-bg hover:grayscale-0',
            !selectedReactions.has(emoji) && 'grayscale',
          )}
          onPress={() => {
            if (selectedReactions.has(emoji)) {
              doRemoveReaction(emoji)
            } else {
              doReact(emoji)
            }
          }}
        >
          <Twemoji key={emoji} emoji={emoji} size={REACTION_BUTTON_SIZE} />
        </ariaComponents.Button>
      ))}
    </div>
  )
}

// =================
// === Reactions ===
// =================

/** Props for a {@link Reactions}. */
export interface ReactionsProps {
  readonly reactions: chat.ReactionSymbol[]
}

/** A list of emoji reactions that have been on a message. */
function Reactions(props: ReactionsProps) {
  const { reactions } = props

  if (reactions.length === 0) {
    return null
  } else {
    return (
      <div>
        {reactions.map((reaction) => (
          <Twemoji key={reaction} emoji={reaction} size={REACTION_SIZE} />
        ))}
      </div>
    )
  }
}

// ===================
// === ChatMessage ===
// ===================

/** Props for a {@link ChatMessage}. */
export interface ChatMessageProps {
  readonly message: ChatDisplayMessage
  readonly reactions: chat.ReactionSymbol[]
  readonly shouldShowReactionBar: boolean
  readonly doReact: (reaction: chat.ReactionSymbol) => void
  readonly doRemoveReaction: (reaction: chat.ReactionSymbol) => void
}

/** A chat message, including user info, sent date, and reactions (if any). */
function ChatMessage(props: ChatMessageProps) {
  const { message, reactions, shouldShowReactionBar, doReact, doRemoveReaction } = props
  const [isHovered, setIsHovered] = React.useState(false)
  return (
    <div
      className="mx-chat-message-x my-chat-message-y"
      onMouseEnter={() => {
        setIsHovered(true)
      }}
      onMouseLeave={() => {
        setIsHovered(false)
      }}
    >
      <div className="flex">
        <img
          crossOrigin="anonymous"
          src={message.avatar ?? DefaultUserIcon}
          className="my-chat-profile-picture-y size-chat-profile-picture rounded-full"
        />
        <div className="mx-chat-message-info-x leading-cozy">
          <div className="font-bold">{message.name}</div>
          <div className="text-primary text-opacity-unimportant">
            {dateTime.formatDateTimeChatFriendly(new Date(message.timestamp))}
          </div>
        </div>
      </div>
      <div className="whitespace-pre-wrap">
        {message.content}
        <Reactions reactions={reactions} />
      </div>
      {shouldShowReactionBar && (
        <ReactionBar
          doReact={doReact}
          doRemoveReaction={doRemoveReaction}
          selectedReactions={new Set(message.reactions)}
        />
      )}
      {message.isStaffMessage && !shouldShowReactionBar && isHovered && (
        <div className="relative -my-chat-reaction-bar-py h py-chat-reaction-bar-y">
          <ReactionBar
            doReact={doReact}
            doRemoveReaction={doRemoveReaction}
            selectedReactions={new Set(message.reactions)}
            className="absolute shadow-soft"
          />
        </div>
      )}
    </div>
  )
}

// ==================
// === ChatHeader ===
// ==================

/** Props for a {@Link ChatHeader}. */
interface InternalChatHeaderProps {
  readonly threads: chat.ThreadData[]
  readonly setThreads: React.Dispatch<React.SetStateAction<chat.ThreadData[]>>
  readonly threadId: chat.ThreadId | null
  readonly threadTitle: string
  readonly setThreadTitle: (threadTitle: string) => void
  readonly switchThread: (threadId: chat.ThreadId) => void
  readonly sendMessage: (message: chat.ChatClientMessageData) => void
  readonly doClose: () => void
}

/** The header bar for a {@link Chat}. Includes the title, close button, and threads list. */
function ChatHeader(props: InternalChatHeaderProps) {
  const { threads, setThreads, threadId, threadTitle, setThreadTitle } = props
  const { switchThread, sendMessage, doClose } = props
  const [isThreadListVisible, setIsThreadListVisible] = React.useState(false)
  // These will never be `null` as their values are set immediately.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const titleInputRef = React.useRef<HTMLInputElement>(null!)

  React.useEffect(() => {
    titleInputRef.current.value = threadTitle
  }, [threadTitle])

  React.useEffect(() => {
    const onClick = () => {
      setIsThreadListVisible(false)
    }
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <>
      <div className="mx-chat-header-x mt-chat-header-t flex text-sm font-semibold">
        <ariaComponents.Button
          size="custom"
          variant="custom"
          className="flex grow items-center gap-icon-with-text"
          onPress={() => {
            setIsThreadListVisible((visible) => !visible)
          }}
        >
          <SvgMask
            className={tailwindMerge.twMerge(
              'shrink-0 transition-transform duration-arrow',
              isThreadListVisible ? '-rotate-90' : 'rotate-90',
            )}
            src={FolderArrowIcon}
          />
          <div className="grow">
            <aria.Input
              type="text"
              ref={titleInputRef}
              defaultValue={threadTitle}
              className="w-full bg-transparent leading-chat-thread-title"
              onClick={(event) => {
                event.stopPropagation()
              }}
              onKeyDown={(event) => {
                switch (event.key) {
                  case 'Escape': {
                    event.currentTarget.value = threadTitle
                    break
                  }
                  case 'Enter': {
                    event.currentTarget.blur()
                    break
                  }
                }
              }}
              onBlur={(event) => {
                const newTitle = event.currentTarget.value
                setThreadTitle(newTitle)
                if (threadId != null) {
                  setThreads((oldThreads) =>
                    oldThreads.map((thread) =>
                      thread.id !== threadId ? thread : object.merge(thread, { title: newTitle }),
                    ),
                  )
                  sendMessage({
                    type: chat.ChatMessageDataType.renameThread,
                    title: newTitle,
                    threadId: threadId,
                  })
                }
              }}
            />
          </div>
        </ariaComponents.Button>
        <ariaComponents.Button
          size="custom"
          variant="custom"
          className="mx-close-icon"
          onPress={doClose}
        >
          <img src={CloseLargeIcon} />
        </ariaComponents.Button>
      </div>
      <div className="relative text-sm font-semibold">
        <div
          className={tailwindMerge.twMerge(
            'absolute z-1 grid w-full overflow-hidden bg-frame shadow-soft backdrop-blur-default transition-grid-template-rows clip-path-bottom-shadow',
            isThreadListVisible ? 'grid-rows-1fr' : 'grid-rows-0fr',
          )}
        >
          <div className="max-h-chat-thread-list min-h overflow-y-auto">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={tailwindMerge.twMerge(
                  'flex p-chat-thread-button',
                  thread.id === threadId ?
                    'cursor-default bg-selected-frame'
                  : 'cursor-pointer hover:bg-frame',
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  if (thread.id !== threadId) {
                    switchThread(thread.id)
                    setIsThreadListVisible(false)
                  }
                }}
              >
                <div className="w-chat-indicator text-center">
                  {/* {thread.hasUnreadMessages ? '(!) ' : ''} */}
                </div>
                <div>{thread.title}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ============
// === Chat ===
// ============

/** Props for a {@link Chat}. */
export interface ChatProps {
  /** This should only be false when the panel is closing. */
  readonly isOpen: boolean
  readonly doClose: () => void
  readonly endpoint: string
}

/** Chat sidebar. */
export default function Chat(props: ChatProps) {
  const { isOpen, doClose, endpoint } = props
  const { accessToken: rawAccessToken } = authProvider.useFullUserSession()
  const { getText } = textProvider.useText()
  const logger = loggerProvider.useLogger()
  const toastAndLog = toastAndLogHooks.useToastAndLog()
  const { isFocusVisible } = aria.useFocusVisible()
  const { focusWithinProps } = aria.useFocusWithin({
    onFocusWithin: (event: FocusEvent) => {
      if (
        isFocusVisible &&
        !isOpen &&
        (event.relatedTarget instanceof HTMLElement || event.relatedTarget instanceof SVGElement)
      ) {
        const relatedTarget = event.relatedTarget
        setTimeout(() => {
          relatedTarget.focus()
        })
      }
    },
  })
  const gtagEvent = gtagHooks.useGtagEvent()

  React.useEffect(() => {
    if (!isOpen) {
      return
    } else {
      return gtagHooks.gtagOpenCloseCallback(gtagEvent, 'cloud_open_chat', 'cloud_close_chat')
    }
  }, [isOpen, gtagEvent])

  /**
   * This is SAFE, because this component is only rendered when `accessToken` is present.
   * See `dashboard.tsx` for its sole usage.
   */
  const accessToken = rawAccessToken

  const [isPaidUser, setIsPaidUser] = React.useState(true)
  const [isReplyEnabled, setIsReplyEnabled] = React.useState(false)
  // `true` if and only if scrollback was triggered for the current thread.
  const [shouldIgnoreMessageLimit, setShouldIgnoreMessageLimit] = React.useState(false)
  const [isAtBeginning, setIsAtBeginning] = React.useState(false)
  const [threads, setThreads] = React.useState<chat.ThreadData[]>([])
  const [messages, setMessages] = React.useState<ChatDisplayMessage[]>([])
  const [threadId, setThreadId] = React.useState<chat.ThreadId | null>(null)
  const [threadTitle, setThreadTitle] = React.useState(DEFAULT_THREAD_TITLE)
  const [isAtTop, setIsAtTop] = React.useState(false)
  const [isAtBottom, setIsAtBottom] = React.useState(true)
  const [messagesHeightBeforeMessageHistory, setMessagesHeightBeforeMessageHistory] =
    React.useState<number | null>(null)
  const [webSocket, setWebsocket] = React.useState<WebSocket | null>(null)
  const messageInputRef = React.useRef<HTMLTextAreaElement>(null)
  const messagesRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setIsPaidUser(false)
  }, [])

  React.useEffect(() => {
    if (isOpen) {
      const newWebSocket = new WebSocket(endpoint)
      setWebsocket(newWebSocket)
      return () => {
        if (newWebSocket.readyState === WebSocket.OPEN) {
          newWebSocket.close()
        } else {
          newWebSocket.addEventListener('open', () => {
            newWebSocket.close()
          })
        }
      }
    } else {
      return
    }
  }, [isOpen, endpoint])

  const autoScrollDeps = useSyncRef({ isAtBottom, isAtTop, messagesHeightBeforeMessageHistory })
  React.useLayoutEffect(() => {
    const deps = autoScrollDeps.current
    const element = messagesRef.current
    if (element != null && deps.isAtTop && deps.messagesHeightBeforeMessageHistory != null) {
      element.scrollTop = element.scrollHeight - deps.messagesHeightBeforeMessageHistory
      setMessagesHeightBeforeMessageHistory(null)
    } else if (element != null && deps.isAtBottom) {
      element.scrollTop = element.scrollHeight - element.clientHeight
    }
  }, [messages, autoScrollDeps])

  const sendMessage = React.useCallback(
    (message: chat.ChatClientMessageData) => {
      webSocket?.send(JSON.stringify(message))
    },
    [webSocket],
  )

  React.useEffect(() => {
    const onMessage = (data: MessageEvent) => {
      if (typeof data.data !== 'string') {
        logger.error('Chat cannot handle binary messages.')
      } else {
        // This is SAFE, as the format of server messages is known.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const message: chat.ChatServerMessageData = JSON.parse(data.data)
        switch (message.type) {
          case chat.ChatMessageDataType.serverThreads: {
            setThreads(message.threads)
            break
          }
          case chat.ChatMessageDataType.serverThread: {
            if (!threads.some((thread) => thread.id === message.id)) {
              setThreads((oldThreads) => {
                const newThread = {
                  id: message.id,
                  title: message.title,
                  hasUnreadMessages: false,
                }
                if (!oldThreads.some((thread) => thread.id === message.id)) {
                  return [...oldThreads, newThread]
                } else {
                  return oldThreads.map((oldThread) =>
                    oldThread.id === newThread.id ? newThread : oldThread,
                  )
                }
              })
            }
            setShouldIgnoreMessageLimit(false)
            setThreadId(message.id)
            setThreadTitle(message.title)
            setIsAtBeginning(message.isAtBeginning)
            const newMessages = message.messages.flatMap((innerMessage) => {
              switch (innerMessage.type) {
                case chat.ChatMessageDataType.serverMessage: {
                  const displayMessage: ChatDisplayMessage = {
                    id: innerMessage.id,
                    isStaffMessage: true,
                    content: innerMessage.content,
                    reactions: innerMessage.reactions,
                    avatar: innerMessage.authorAvatar,
                    name: innerMessage.authorName,
                    timestamp: innerMessage.timestamp,
                    editedTimestamp: innerMessage.editedTimestamp,
                  }
                  return displayMessage
                }
                case chat.ChatMessageDataType.serverReplayedMessage: {
                  const displayMessage: ChatDisplayMessage = {
                    id: innerMessage.id,
                    isStaffMessage: false,
                    content: innerMessage.content,
                    reactions: [],
                    avatar: null,
                    name: 'Me',
                    timestamp: innerMessage.timestamp,
                    editedTimestamp: null,
                  }
                  return displayMessage
                }
              }
            })
            switch (message.requestType) {
              case chat.ChatMessageDataType.historyBefore: {
                setMessages((oldMessages) => [...newMessages, ...oldMessages])
                break
              }
              case chat.ChatMessageDataType.authenticate:
              case chat.ChatMessageDataType.newThread:
              case chat.ChatMessageDataType.switchThread:
              default: {
                setMessages(newMessages)
                break
              }
            }
            break
          }
          case chat.ChatMessageDataType.serverMessage: {
            const newMessage: ChatDisplayMessage = {
              id: message.id,
              isStaffMessage: true,
              avatar: message.authorAvatar,
              name: message.authorName,
              content: message.content,
              reactions: [],
              timestamp: message.timestamp,
              editedTimestamp: null,
            }
            setMessages((oldMessages) => {
              const newMessages = [...oldMessages, newMessage]
              return shouldIgnoreMessageLimit ? newMessages : (
                  newMessages.slice(-MAX_MESSAGE_HISTORY)
                )
            })
            break
          }
          case chat.ChatMessageDataType.serverEditedMessage: {
            setMessages(
              messages.map((otherMessage) =>
                otherMessage.id !== message.id ?
                  otherMessage
                : object.merge(otherMessage, {
                    content: message.content,
                    editedTimestamp: message.timestamp,
                  }),
              ),
            )
            break
          }
          case chat.ChatMessageDataType.serverReplayedMessage: {
            // This message is only sent as part of the `serverThread` message and
            // can safely be ignored.
            break
          }
        }
      }
    }
    const onOpen = () => {
      sendMessage({
        type: chat.ChatMessageDataType.authenticate,
        accessToken,
      })
    }
    webSocket?.addEventListener('message', onMessage)
    webSocket?.addEventListener('open', onOpen)
    return () => {
      webSocket?.removeEventListener('message', onMessage)
      webSocket?.removeEventListener('open', onOpen)
    }
  }, [webSocket, shouldIgnoreMessageLimit, logger, threads, messages, accessToken, sendMessage])

  const container = document.getElementById(HELP_CHAT_ID)

  const switchThread = React.useCallback(
    (newThreadId: chat.ThreadId) => {
      const threadData = threads.find((thread) => thread.id === newThreadId)
      if (threadData == null) {
        toastAndLog('unknownThreadIdError', null, newThreadId)
      } else {
        sendMessage({
          type: chat.ChatMessageDataType.switchThread,
          threadId: newThreadId,
        })
      }
    },
    [threads, toastAndLog, sendMessage],
  )

  const sendCurrentMessage = React.useCallback(
    (createNewThread?: boolean) => {
      const element = messageInputRef.current
      if (element != null) {
        const content = element.value
        if (NON_WHITESPACE_CHARACTER_REGEX.test(content)) {
          setIsReplyEnabled(false)
          element.value = ''
          element.style.height = '0px'
          element.style.height = `${element.scrollHeight}px`
          const newMessage: ChatDisplayMessage = {
            // This MUST be unique.
            id: MessageId(String(Number(new Date()))),
            isStaffMessage: false,
            avatar: null,
            name: getText('me'),
            content,
            reactions: [],
            timestamp: Number(new Date()),
            editedTimestamp: null,
          }
          if (threadId == null || createNewThread === true) {
            const newThreadTitle = threadId == null ? threadTitle : makeNewThreadTitle(threads)
            sendMessage({
              type: chat.ChatMessageDataType.newThread,
              title: newThreadTitle,
              content,
            })
            setThreadId(null)
            setThreadTitle(newThreadTitle)
            setMessages([newMessage])
          } else {
            sendMessage({
              type: chat.ChatMessageDataType.message,
              threadId,
              content,
            })
            setMessages((oldMessages) => {
              const newMessages = [...oldMessages, newMessage]
              return shouldIgnoreMessageLimit ? newMessages : (
                  newMessages.slice(-MAX_MESSAGE_HISTORY)
                )
            })
          }
        }
      }
    },
    [threads, threadId, threadTitle, shouldIgnoreMessageLimit, getText, sendMessage],
  )

  const upgradeToPro = () => {
    // TODO:
  }

  if (container == null) {
    logger.error('Chat container not found.')
    return null
  } else {
    // This should be `findLast`, but that requires ES2023.
    const lastStaffMessage = [...messages].reverse().find((message) => message.isStaffMessage)

    return reactDom.createPortal(
      <div
        className={tailwindMerge.twMerge(
          'fixed right top z-1 flex h-screen w-chat flex-col py-chat-y text-xs text-primary shadow-soft backdrop-blur-default transition-[transform,opacity]',
          isOpen ? 'opacity-1' : 'translate-x-full opacity-0',
        )}
        {...focusWithinProps}
      >
        <ChatHeader
          threads={threads}
          setThreads={setThreads}
          threadId={threadId}
          threadTitle={threadTitle}
          setThreadTitle={setThreadTitle}
          switchThread={switchThread}
          sendMessage={sendMessage}
          doClose={doClose}
        />
        <div
          ref={messagesRef}
          className="flex-1 overflow-scroll"
          onScroll={(event) => {
            const element = event.currentTarget
            const isNowAtTop = element.scrollTop === 0
            const isNowAtBottom = element.scrollTop + element.clientHeight === element.scrollHeight
            const firstMessage = messages[0]
            if (isNowAtTop && !isAtBeginning && firstMessage != null) {
              setShouldIgnoreMessageLimit(true)
              sendMessage({
                type: chat.ChatMessageDataType.historyBefore,
                messageId: firstMessage.id,
              })
              setMessagesHeightBeforeMessageHistory(element.scrollHeight)
            }
            if (isNowAtTop !== isAtTop) {
              setIsAtTop(isNowAtTop)
            }
            if (isNowAtBottom !== isAtBottom) {
              setIsAtBottom(isNowAtBottom)
            }
          }}
        >
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              reactions={[]}
              doReact={(reaction) => {
                sendMessage({
                  type: chat.ChatMessageDataType.reaction,
                  messageId: message.id,
                  reaction,
                })
                setMessages((oldMessages) =>
                  oldMessages.map((oldMessage) =>
                    oldMessage.id === message.id ?
                      object.merge(message, {
                        reactions: [...oldMessage.reactions, reaction],
                      })
                    : oldMessage,
                  ),
                )
              }}
              doRemoveReaction={(reaction) => {
                sendMessage({
                  type: chat.ChatMessageDataType.removeReaction,
                  messageId: message.id,
                  reaction,
                })
                setMessages((oldMessages) =>
                  oldMessages.map((oldMessage) =>
                    oldMessage.id === message.id ?
                      object.merge(message, {
                        reactions: oldMessage.reactions.filter(
                          (oldReaction) => oldReaction !== reaction,
                        ),
                      })
                    : oldMessage,
                  ),
                )
              }}
              shouldShowReactionBar={message === lastStaffMessage || message.reactions.length !== 0}
            />
          ))}
        </div>
        <form
          className="mx-chat-form-x my-chat-form-y rounded-default bg-frame p-chat-form"
          onSubmit={() => {
            sendCurrentMessage()
          }}
        >
          <textarea
            ref={messageInputRef}
            rows={1}
            required
            placeholder={getText('chatInputPlaceholder')}
            className="w-full resize-none rounded-chat-input bg-transparent p-chat-input"
            onKeyDown={(event) => {
              switch (event.key) {
                case 'Enter': {
                  // If the shift key is not pressed, submit the form.
                  // If the shift key is pressed, keep the default
                  // behavior of adding a newline.
                  if (!event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }
              }
            }}
            onInput={(event) => {
              const element = event.currentTarget
              element.style.height = '0px'
              element.style.height =
                `min(${MAX_MESSAGE_INPUT_LINES}lh,` + `${element.scrollHeight + 1}px)`
              const newIsReplyEnabled = NON_WHITESPACE_CHARACTER_REGEX.test(element.value)
              if (newIsReplyEnabled !== isReplyEnabled) {
                setIsReplyEnabled(newIsReplyEnabled)
              }
            }}
          />
          <div className="flex gap-chat-buttons">
            <ariaComponents.Button
              size="custom"
              variant="custom"
              isDisabled={!isReplyEnabled}
              className={tailwindMerge.twMerge(
                'text-xxs grow rounded-full px-chat-button-x py-chat-button-y text-left text-white',
                isReplyEnabled ? 'bg-gray-400' : 'bg-gray-300',
              )}
              onPress={() => {
                sendCurrentMessage(true)
              }}
            >
              {getText('clickForNewQuestion')}
            </ariaComponents.Button>
            <ariaComponents.Button
              size="custom"
              variant="custom"
              isDisabled={!isReplyEnabled}
              className="rounded-full bg-blue-600/90 px-chat-button-x py-chat-button-y text-white selectable enabled:active"
              onPress={() => {
                sendCurrentMessage()
              }}
            >
              {getText('replyExclamation')}
            </ariaComponents.Button>
          </div>
        </form>
        {!isPaidUser && (
          <ariaComponents.Button
            size="custom"
            variant="custom"
            className="mx-2 my-1 text-wrap rounded-2xl bg-call-to-action/90 p-2 text-center leading-cozy text-white hover:bg-call-to-action"
            onPress={upgradeToPro}
          >
            {getText('upgradeToProNag')}
          </ariaComponents.Button>
        )}
      </div>,
      container,
    )
  }
}
