import {useParams} from 'wouter';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/hooks/use-auth';
import {request} from '@/lib/learning-api';
import LegacyLessonPage from './lesson-page';
import {ImmersiveLesson} from '@/components/experience/lesson';
import {ExperienceReviews} from '@/components/experience/reviews';
import type {Package} from '@/components/experience/types';
export default function ExperiencePage(){const {id}=useParams<{id:string}>(),{user}=useAuth();const q=useQuery<Package|{available:false}>({queryKey:['lesson-experience',id,user?.id],queryFn:()=>request('GET','/api/learn/lessons/'+id+'/experience'),retry:false});if(q.isLoading)return <div className="xp-learning xp-panel" role="status">Dars ochilmoqda…</div>;if(q.data?.available)return <ImmersiveLesson key={id+':'+q.data.version+':'+user?.id} p={q.data} call={request} media={p=>p} userKey={user?.id||''} home="/today" reviewLink="/review/experience"/>;return <LegacyLessonPage/>}
export function DailyReviewPage(){const {user}=useAuth();return <ExperienceReviews call={request} userKey={user?.id||''} home="/today" lessonLink="/learn/50"/>}
