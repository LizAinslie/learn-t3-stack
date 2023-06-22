/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { TextChannel } from '@prisma/client';
import { Hashtag } from 'iconsax-react';
import {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  NextPage,
} from 'next';
import Head from 'next/head';
import React, { useRef } from 'react';
import Message from '../../../../components/message';
import { getServerAuthSession } from '../../../../server/common/get-server-auth-session';
import { trpc } from '../../../../utils/trpc';
import { prisma } from '../../../../server/db/client';
import { useSession } from 'next-auth/react';
import { LoadingMessage } from '../../../../components/loading';
import MessageBox from '../../../../components/messageBox';
import ApplicationSidebar from '../../../../components/appSidebar';
import { useWS } from '../../../../contexts/WSProvider';
import useMessages, { MessageType } from '../../../../hooks/useMessages';

type ChatPageServerSideProps = {
  channel: TextChannel;
  serverId: string;
  messageLink: string | null;
};

type ChatPageProps = ChatPageServerSideProps;

const ChatPage: NextPage<ChatPageProps> = ({ channel, serverId }) => {
  const createMessageMutation = trpc.channel.createMessage.useMutation();
  const { data: session } = useSession();

  const wsContext = useWS();
  if (!wsContext) throw new Error('WSContext not found');
  const waitingToReconnect = wsContext?.connecting;

  const pendingMessage = useRef<MessageType | null>(null);
  const pendingNonce = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [messages, loading, loadMessages] = useMessages(
    channel.id,
    (msg, nonce) => {
      if (pendingNonce.current === nonce) {
        pendingNonce.current = null;
        pendingMessage.current = null;
      }
    },
  );

  function sendMessage(msg: string) {
    if (msg.trim() === '') return;
    pendingMessage.current = {
      createdTimestamp: new Date(),
      content: msg.trim(),
      id: '',
      channelId: channel.id,
      authorId: session!.user!.id,
      author: {
        id: session!.user!.id,
        name: session!.user!.name!,
        image: session!.user!.image!,
      },
      embeds: [],
    };

    (pendingNonce.current = window.crypto.randomUUID()),
      createMessageMutation.mutate({
        channelId: channel.id,
        content: msg,
        nonce: pendingNonce.current,
      });

    return {
      sent: true,
    };
  }

  function handleScroll(e: React.UIEvent<HTMLElement>) {
    if (
      e.currentTarget.scrollHeight + e.currentTarget.scrollTop ===
      e.currentTarget.clientHeight
    ) {
      loadMessages();
    }
  }

  return (
    <>
      <Head>
        <title>Iridium Chat | #{channel.name}</title>
      </Head>

      <main
        className='flex h-screen w-screen bg-white dark:bg-slate-900'
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
        <ApplicationSidebar
          currentChannelId={channel.id}
          currentServerId={serverId}
          isServerSelected={true}
        />
        <div className='flex flex-grow flex-col'>
          <div className='flex content-center gap-x-4 border-b border-gray-200 px-6 py-4'>
            <Hashtag color='currentColor' className='h-7 w-7 dark:text-white' />
            <div className='text-xl font-semibold dark:text-white'>
              {channel.name}
            </div>
          </div>
          <div className='relative flex-grow'>
            <div
              className={`${
                messages.length === 0 ? 'overflow-y-hidden' : 'overflow-y-auto'
              } absolute bottom-0 top-0 flex w-full flex-col-reverse`}
              onScroll={handleScroll}
            >
              <div className='grid grid-cols-1 items-stretch justify-end gap-3'>
                {loading ? <LoadingMessage /> : ''}
                {messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))}
                {pendingMessage.current && (
                  <Message key={0} pending message={pendingMessage.current} />
                )}
              </div>
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className='border-t border-gray-200 bg-white px-6 py-4 dark:bg-slate-800'>
            <MessageBox
              connecting={waitingToReconnect}
              channelName={`#${channel.name}`}
              onSend={sendMessage}
            />
          </div>
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async ({
  req,
  res,
  params,
}: GetServerSidePropsContext): Promise<
  GetServerSidePropsResult<ChatPageServerSideProps>
> => {
  const session = await getServerAuthSession({ req, res });

  if (!session || !params)
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };

  const channelId = params['channelId'] as string;
  const channel = await prisma.textChannel.findUnique({
    where: {
      id: channelId,
    },
  });

  if (!channel)
    return {
      notFound: true,
    };

  return {
    props: {
      channel: JSON.parse(JSON.stringify(channel)), // dumbshit
      serverId: params['id'] as string,
      messageLink: null,
    },
  };
};

export default ChatPage;
