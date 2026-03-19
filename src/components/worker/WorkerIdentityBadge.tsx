import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { User, ChevronDown, Settings } from 'lucide-react';
import { useWorkerIdentity } from './WorkerIdentityContext';
import { WorkerIdentityModal } from './WorkerIdentityModal';

export function WorkerIdentityBadge() {
  const { currentWorker, activeWorkers, setCurrentWorker } = useWorkerIdentity();
  const [modalOpen, setModalOpen] = useState(false);

  if (!currentWorker) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-8">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{currentWorker.worker.name}</span>
            <Badge variant="secondary" className="text-xs">
              #{currentWorker.worker.card_number}
            </Badge>
            {activeWorkers.length > 1 && (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-right">
          {activeWorkers.length > 1 && (
            <>
              {activeWorkers.map((session) => (
                <DropdownMenuItem
                  key={session.id}
                  onClick={() => setCurrentWorker(session)}
                  className={session.id === currentWorker.id ? 'bg-accent' : ''}
                >
                  <User className="h-4 w-4 ml-2" />
                  {session.worker.name}
                  <Badge variant="outline" className="mr-2 text-xs">
                    #{session.worker.card_number}
                  </Badge>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => setModalOpen(true)}>
            <Settings className="h-4 w-4 ml-2" />
            ניהול עובדים
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WorkerIdentityModal 
        open={modalOpen} 
        onClose={() => setModalOpen(false)} 
      />
    </>
  );
}
